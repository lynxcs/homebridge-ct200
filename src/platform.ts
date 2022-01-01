import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Thermostat } from './thermostat';
import { AwaySwitch } from './switch';
import { EP_ZONES, EP_LOCALIZATION, EP_HUMIDITY, EP_AWAY, EP_BZ_MODE, EP_BZ_TARGET_TEMP } from './endpoints';
import { connectAPI, getEndpoint } from './client';

// All the info needed to describe a Zone
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

export let globalState: SystemStatus;
export let globalLogger: Logger;
let globalPlatform: CT200Platform;

export function processResponse(response) {
    globalLogger.debug('Processing ' + response['id']);

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
                    savedZone.currentTemp = zone.temp <= 100 ? zone.temp : savedZone.currentTemp;
                    savedZone.state = zone.status.includes('heat') ? 1 : 0;

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
            globalState.localization = response['value'] === 'Celsius' ? 0 : 1;
            globalState.zones.forEach((zone) => {
                const thermostat = zone.accessory.getService(globalPlatform.Service.Thermostat);
                if (thermostat) {
                    thermostat.updateCharacteristic(globalPlatform.Characteristic.TemperatureDisplayUnits, globalState.localization);
                }
            });

            break;
        }

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
            globalState.away.state = response['value'] === 'false' ? 0 : 1;
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

        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            connectAPI(config['serial'], config['access'], config['password']).then(() => {
                this.log.debug('Finished initializing platform:', this.config.platform);
                this.discoverDevices();
            });
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
                const accessory = new this.api.platformAccessory(zone.name, uuid, this.api.hap.Categories.THERMOSTAT);

                accessory.context.id = zone.index;
                accessory.context.name = zone.name;

                new Thermostat(this, accessory);
                globalState.zones.set(zone.index, new Zone(accessory));
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        });

        this.accessories.forEach(existingAccessory => {
            if (!this.config['zones'].find((configAccessory: ConfigZone) => existingAccessory.context.id === configAccessory.index)
               && existingAccessory.context.id !== undefined) {
                this.log.debug('Unregistering zone with index ' + existingAccessory.context.id);
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
            }
        });

        // By default, enable away mode switch
        const awayUUID = this.api.hap.uuid.generate('AWAY');
        const existingAway = this.accessories.find(accessory => accessory.UUID === awayUUID);
        if (!('away' in this.config) || this.config['away'] === true) {
            if (existingAway) {
                this.log.debug('Restoring Away switch from cache');
                new AwaySwitch(this, existingAway);
                globalState.away.accessory = existingAway;
            } else {
                this.log.debug('Creating new Away switch');
                const accessory = new this.api.platformAccessory('AWAY', awayUUID, this.api.hap.Categories.SWITCH);

                new AwaySwitch(this, accessory);
                globalState.away.accessory = accessory;
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        } else {
            this.log.debug('Away switch disabled');
            if (existingAway) {
                this.log.debug('Unregistering existing away switch');
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAway]);
            }
        }

        // Get initial zone state
        getEndpoint(EP_ZONES);

        // Get initial humidity
        getEndpoint(EP_HUMIDITY);

        // Get localization option
        getEndpoint(EP_LOCALIZATION);

        // Configure zone info refresh
        let zoneInterval: number = 'zoneInterval' in this.config ? this.config['zoneInterval'] : 2;
        if (zoneInterval < 1) {
            this.log.warn('Zone refresh interval can\'t be less than 1! Setting to 1');
            zoneInterval = 1;
        }
        setInterval(() => {
            globalLogger.debug('Updating zone status');
            getEndpoint(EP_ZONES);
        }, 1000 * 60 * zoneInterval);

        // Configure humidity and localization refresh
        let auxInterval: number = 'auxInterval' in this.config ? this.config['auxInterval'] : 5;
        if (auxInterval < 1) {
            this.log.warn('Auxiliary refresh interval can\'t be less than 1! Setting to 1');
            auxInterval = 1;
        }
        setInterval(() => {
            globalLogger.debug('Updating humidity and localization status');
            getEndpoint(EP_HUMIDITY);
            getEndpoint(EP_LOCALIZATION);
        }, 1000 * 60 * auxInterval);
    }
}
