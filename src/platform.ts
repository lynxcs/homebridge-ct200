import { EasyControlClient } from 'bosch-xmpp';
import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Thermostat } from './thermostat';


// Global Bosch system status

// All the info needed to descripe a Zone
class Zone {
    id = -1;
    currentTemp = -1;
    wantedTemp = -1;
    state = -1;
    mode = -1;
    name = 'not initialized';
    accessory: PlatformAccessory;

    constructor(accessory: PlatformAccessory) {
        this.accessory = accessory;
        this.id = this.accessory.context.id;
        this.name = this.accessory.context.name;
    }
}

// Info returned by /zones/list

class SystemStatus {
    zones: Map<number, Zone> = new Map();
    humidity = -1;
    away = true;
    localization = -1;
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
        case '/zones/list': {
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
                    savedZone.currentTemp = zone.temp;
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

        case '/gateway/localisation': {
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
        case '/system/sensors/humidity/indoor_h1': {
            globalState.humidity = response['value'];
            globalState.zones.forEach((zone) => {
                const thermostat = zone.accessory.getService(globalPlatform.Service.Thermostat);
                if (thermostat) {
                    thermostat.updateCharacteristic(globalPlatform.Characteristic.CurrentRelativeHumidity, globalState.humidity);
                }
            });
            break;
        }

        case '/system/awayMode/enabled': {
            if (response['value'] === 'false') {
                globalState.away = false;
            } else {
                globalState.away = true;
            }
            // const modeSwitch = globalState.away.accessory.getService(globalPlatform.Service.Switch);
            // if (modeSwitch) {
            //     if (globalState.away === true) {
            //         modeSwitch.updateCharacteristic(globalPlatform.Characteristic.On, 1);
            //     } else {
            //         modeSwitch.updateCharacteristic(globalPlatform.Characteristic.On, 0);
            //     }
            // }
            break;
        }

        default: {
            const endpoint: string = response['id'];
            const id: number = parseInt(response['id'].replace(/[^0-9]/g, ''), 10);
            const savedZone = globalState.zones.get(id);
            if (savedZone) {
                const thermostat = savedZone.accessory.getService(globalPlatform.Service.Thermostat);
                if (thermostat) {
                    if (endpoint.includes('userMode')) {
                        if (response['value'] === 'clock') {
                            savedZone.mode = 3;
                        } else {
                            savedZone.mode = 1;
                        }
                        thermostat.updateCharacteristic(globalPlatform.Characteristic.TargetHeatingCoolingState, savedZone.mode);
                    } else if (endpoint.includes('temperatureHeatingSetpoint')) {
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

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class CT200Platform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        globalLogger = this.log;
        globalPlatform = this;
        connectAPI(config['serial'], config['access'], config['password']).then(() => {
            this.log.debug('Finished initializing platform:', this.config.platform);
        });

        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            // run the method to discover / register your devices as accessories
            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    discoverDevices() {

        globalState = new SystemStatus();

        interface ConfigZone {
            index: number;
            name: string;
        }

        this.log.error(this.config['zones']);
        this.config['zones'].forEach((zone: ConfigZone) => {
            // for (const zone of configZones.string) {
            const uuid = this.api.hap.uuid.generate(zone.index.toString());
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
                this.log.info('(with id:', existingAccessory.context.id, ')');

                new Thermostat(this, existingAccessory);
                globalState.zones.set(zone.index, new Zone(existingAccessory));

            } else {
                this.log.info('Adding new accessory:', zone.name);
                const accessory = new this.api.platformAccessory(zone.name, uuid);

                accessory.context.id = zone.index;
                accessory.context.name = zone.name;

                new Thermostat(this, accessory);
                globalState.zones.set(zone.index, new Zone(accessory));

                // link the accessory to your platform
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                this.accessories.push(accessory);
            }

        });

        // Get initial zone state
        globalClient.get('/zones/list').then((response) => {
            processResponse(response);
        });

        // Get initial humidity
        globalClient.get('/system/sensors/humidity/indoor_h1').then((response) => {
            processResponse(response);
        });

        // Get localization option
        globalClient.get('/gateway/localisation').then((response) => {
            processResponse(response);
        });

        // Refresh zone state every minute
        setInterval(() => {
            globalLogger.debug('Executing 1 min getter (zones)');
            globalClient.get('/zones/list').then((response) => {
                processResponse(response);
            });
        }, 1000 * 60);

        // Refresh humidity and localization every 5 mins
        setInterval(() => {
            globalLogger.debug('Executing 5 min getter (localisation and humidity)');
            globalClient.get('/system/sensors/humidity/indoor_h1').then((response) => {
                processResponse(response);
            });

            globalClient.get('/gateway/localisation').then((response) => {
                processResponse(response);
            });
        }, 1000 * 60 * 5);
    }
}
