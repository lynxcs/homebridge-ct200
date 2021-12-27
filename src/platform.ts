import { EasyControlClient } from 'bosch-xmpp';
import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Thermostat } from './thermostat';
import { AwaySwitch } from './switch';
import { EP_ZONES, EP_LOCALIZATION, EP_HUMIDITY, EP_AWAY, EP_BZ_MODE, EP_BZ_TARGET_TEMP } from './endpoints';

// All the info needed to descripe a Zone
class Zone {
    id = 1;
    currentTemp = 0;
    wantedTemp = 10;
    state = 0;
    mode = 1;
    name = 'not initialized';
    accessory: PlatformAccessory;

    constructor(accessory: PlatformAccessory) {
        this.accessory = accessory;
        this.id = this.accessory.context.id;
        this.name = this.accessory.context.name;
    }
}

interface IAway {
    state: number;
    accessory?: PlatformAccessory;
}

// Global Bosch system status
class SystemStatus {
    zones: Map<number, Zone> = new Map();
    humidity = 0;
    away: IAway = {state: 0, accessory: undefined};
    localization = 0;
}

export let globalClient: EasyControlClient;
let globalLogger: Logger;
export let globalState: SystemStatus;
let globalPlatform: CT200Platform;

// export function processResponse(response: object) {
export function processResponse(response) {
    globalLogger.debug('Processing ' + response['id']);
    globalLogger.debug(response);

    switch (response['id']) {
        case EP_ZONES: {

            // Info returned by /zones/list
            interface ResponseZone {
                id: number;
                name: string;
                icon: string;
                program: number;
                temp: number;
                status: string;
            }

            response['value'].forEach((zone: ResponseZone) => {
                const savedZone = globalState.zones.get(zone.id);
                if (savedZone) {
                    if (zone.temp <= 100) {
                        savedZone.currentTemp = zone.temp;
                    }

                    if (zone.status.includes('heat')) {
                        savedZone.state = 1;
                    } else {
                        savedZone.state = 0;
                    }

                    const thermostat = savedZone.accessory.getService((globalPlatform.Service.Thermostat));
                    if (thermostat) {
                        thermostat.updateCharacteristic(globalPlatform.Characteristic.CurrentTemperature,
                            savedZone.currentTemp);

                        thermostat.updateCharacteristic(globalPlatform.Characteristic.CurrentHeatingCoolingState,
                            savedZone.state);
                    }
                    globalState.zones.set(zone.id, savedZone);
                }
            });

            break;
        }

        case EP_LOCALIZATION: {
            if (response['value'] === 'Celsius') {
                globalState.localization = 0;
            } else {
                globalState.localization = 1;
            }

            globalState.zones.forEach((zone) => {
                const thermostat = zone.accessory.getService(globalPlatform.Service.Thermostat);
                if (thermostat) {
                    thermostat.updateCharacteristic(globalPlatform.Characteristic.TemperatureDisplayUnits, globalState.localization);
                }
            });

            break;
        }

        // TODO Figure out if more than one humidity sensor is present (for each zone?)
        case EP_HUMIDITY: {
            globalState.humidity = response['value'];
            globalState.zones.forEach((zone) => {
                const thermostat = zone.accessory.getService(globalPlatform.Service.Thermostat);
                if (thermostat) {
                    thermostat.updateCharacteristic(globalPlatform.Characteristic.CurrentRelativeHumidity, globalState.humidity);
                }
            });
            break;
        }

        case EP_AWAY: {
            if (response['value'] === 'false') {
                globalState.away.state = 0;
            } else {
                globalState.away.state = 1;
            }

            if (globalState.away.accessory) {
                const modeSwitch = globalState.away.accessory.getService(globalPlatform.Service.Switch);
                if (modeSwitch) {
                    modeSwitch.updateCharacteristic(globalPlatform.Characteristic.On, globalState.away.state);
                }
            }
            break;
        }

        default: {
            const endpoint: string = response['id'];
            const id: number = parseInt(response['id'].replace(/[^0-9]/g, ''), 10);
            const savedZone = globalState.zones.get(id);
            if (savedZone) {
                const thermostat = savedZone.accessory.getService(globalPlatform.Service.Thermostat);
                if (thermostat) {
                    if (endpoint.includes(EP_BZ_MODE)) {
                        if (response['value'] === 'clock') {
                            savedZone.mode = 3;
                        } else {
                            savedZone.mode = 1;
                        }
                        thermostat.updateCharacteristic(globalPlatform.Characteristic.TargetHeatingCoolingState, savedZone.mode);
                    } else if (endpoint.includes(EP_BZ_TARGET_TEMP)) {
                        savedZone.wantedTemp = response['value'];
                        thermostat.updateCharacteristic(globalPlatform.Characteristic.TargetTemperature, savedZone.wantedTemp);
                    }
                }
                globalState.zones.set(id, savedZone);
            }
            break;
        }
    }
}

async function connectAPI(serialNumber: number, accessKey: string, password: string) {
    globalClient = EasyControlClient({ serialNumber: serialNumber, accessKey: accessKey, password: password });
    await globalClient.connect().catch(error => globalLogger.error('Failed to connect to client: ' + error));
}

export class CT200Platform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
    public readonly accessories: PlatformAccessory[] = []; // Cache accessories

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        globalLogger = this.log;
        globalPlatform = this;

        if (!config['serial'] || !config['access'] || !config['password'] || !config['zones']) {
            log.error('Config doesn\'t have needed values!');
            process.exit(1);
        }

        connectAPI(config['serial'], config['access'], config['password']).then(() => {
            this.log.debug('Finished initializing platform:', this.config.platform);
        });

        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.accessories.push(accessory);
    }

    discoverDevices() {

        globalState = new SystemStatus();

        interface ConfigZone {
            index: number;
            name: string;
        }

        if (!('zones' in this.config) || this.config['zones'].length === 0) {
            this.log.error('No zones defined!');
            process.exit(1);
        }

        this.config['zones'].forEach((zone: ConfigZone) => {
            const uuid = this.api.hap.uuid.generate(zone.index.toString());
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                this.log.debug('Restoring thermostat from cache:', existingAccessory.displayName, ' (', existingAccessory.context.id, ')');

                new Thermostat(this, existingAccessory);
                globalState.zones.set(zone.index, new Zone(existingAccessory));
            } else {
                this.log.debug('Adding new thermostat:', zone.name);
                const accessory = new this.api.platformAccessory(zone.name, uuid);

                accessory.context.id = zone.index;
                accessory.context.name = zone.name;

                new Thermostat(this, accessory);
                globalState.zones.set(zone.index, new Zone(accessory));

                // link the accessory to your platform
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        });

        this.accessories.forEach(existingAccessory => {
            if (!this.config['zones'].find((configAccessory: ConfigZone) => existingAccessory.context.id === configAccessory.index)) {
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
            }
        });

        // By default, enable away mode switch
        if (!('away' in this.config) || this.config['away'] === true) {
            const uuid = this.api.hap.uuid.generate('AWAY');
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                this.log.debug('Restoring Away switch from cache');

                new AwaySwitch(this, existingAccessory);
                globalState.away.accessory = existingAccessory;
            } else {
                const accessory = new this.api.platformAccessory('AWAY', uuid);

                new AwaySwitch(this, accessory);
                globalState.away.accessory = accessory;

                // link the accessory to your platform
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        } else {
            const uuid = this.api.hap.uuid.generate('AWAY');
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
            }
        }

        // Get initial zone state
        globalClient.get(EP_ZONES).then((response) => {
            processResponse(response);
        });

        // Get initial humidity
        globalClient.get(EP_HUMIDITY).then((response) => {
            processResponse(response);
        });

        // Get localization option
        globalClient.get(EP_LOCALIZATION).then((response) => {
            processResponse(response);
        });

        // Refresh zone state every 2 minutes
        // TODO Make this customizable
        setInterval(() => {
            globalLogger.debug('Executing 1 min getter (zones)');
            globalClient.get(EP_ZONES).then((response) => {
                processResponse(response);
            });
        }, 1000 * 60 * 2);

        // Refresh humidity and localization every 10 mins
        // TODO Make this customizable
        setInterval(() => {
            globalLogger.debug('Executing 5 min getter (localisation and humidity)');
            globalClient.get(EP_HUMIDITY).then((response) => {
                processResponse(response);
            });

            globalClient.get(EP_LOCALIZATION).then((response) => {
                processResponse(response);
            });
        }, 1000 * 60 * 10);
    }
}
