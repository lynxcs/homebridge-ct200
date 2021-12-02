import { EasyControlClient } from 'bosch-xmpp';
import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Thermostat } from './thermostat';


// Global Bosch system status

// All the info needed to descripe a Zone
interface Zone {
    id: number;
    currentTemp: number;
    wantedTemp: number;
    state: number;
    mode: number;
    name: string;
    accessory: PlatformAccessory;
}

// Info returned by /zones/list
interface ResponseZone {
    id: number;
    name: string;
    icon: string;
    program: number;
    temp: number;
    status: string;
}

interface IZone {
    [id: number]: Zone;
}

interface IAway {
    state: boolean;
    accessory: PlatformAccessory;
}

interface SystemStatus {
    zones: IZone;
    humidity: number;
    away: IAway;
    localization: number;
}

export let globalClient: EasyControlClient;
let globalLogger: Logger;
export let globalState: SystemStatus;
let globalPlatform: CT200Platform;

export function processResponse(response) {
    globalLogger.debug('Processing ' + response['id']);
    globalLogger.debug(response);
    globalLogger.debug('\n');

    switch (response['id']) {
        case "/zone/list": {
            const responseZones: { string: ResponseZone[] } = response['value'];
            for (const zone of responseZones.string) {
                globalState.zones[zone.id].currentTemp = zone.temp;
                if (zone.status.includes('heat')) {
                    globalState.zones[zone.id].state = 1; // HEAT
                } else {
                    globalState.zones[zone.id].state = 0; // OFF
                }
                const thermostat = globalState.zones[zone.id].accessory.getService((globalPlatform.Service.Thermostat));
                if (thermostat) {
                    thermostat.updateCharacteristic(globalPlatform.Characteristic.CurrentTemperature,
                        globalState.zones[zone.id].currentTemp);

                    thermostat.updateCharacteristic(globalPlatform.Characteristic.CurrentHeatingCoolingState,
                        globalState.zones[zone.id].state);
                }
            }
            break;
        }

        case "/gateway/localisation": {
            if (response['value'] === 'Celsius') {
                globalState.localization = 0;
            }
            else {
                globalState.localization = 1;
            }

            for (const zone in globalState.zones) {
                const thermostat = globalState.zones[zone].accessory.getService(globalPlatform.Service.Thermostat);
                if (thermostat) {
                    thermostat.updateCharacteristic(globalPlatform.Characteristic.TemperatureDisplayUnits, globalState.localization);
                }
            }
            break;
        }

        // TODO Figure out if more than one humidity sensor is present (for each zone?)
        case "/system/sensors/humidity/indoor_h1": {
            globalState.humidity = response['value'];
            for (const zone in globalState.zones) {
                const thermostat = globalState.zones[zone].accessory.getService(globalPlatform.Service.Thermostat);
                if (thermostat) {
                    thermostat.updateCharacteristic(globalPlatform.Characteristic.CurrentRelativeHumidity, globalState.humidity);
                }
            }
            break;
        }

        case "/system/awayMode/enabled": {
            if (response['value'] === 'false') {
                globalState.away.state = false;
            } else {
                globalState.away.state = true;
            }
            const modeSwitch = globalState.away.accessory.getService(globalPlatform.Service.Switch);
            if (modeSwitch) {
                if (globalState.away.state === true) {
                    modeSwitch.updateCharacteristic(globalPlatform.Characteristic.On, 1);
                } else {
                    modeSwitch.updateCharacteristic(globalPlatform.Characteristic.On, 0);
                }
            }
            break;
        }

        default: {
            const endpoint: string = response['id'];
            const id: number = parseInt(response['id'].replace(/[^0-9]/g, ''), 10);

            const thermostat = globalState.zones[id].accessory.getService(globalPlatform.Service.Thermostat);
            if (thermostat) {
                if (endpoint.includes('userMode')) {
                    if (response['value'] === 'clock') {
                        globalState.zones[id].mode = 3;
                    } else {
                        globalState.zones[id].mode = 1;
                    }
                    thermostat.updateCharacteristic(globalPlatform.Characteristic.TargetHeatingCoolingState, globalState.zones[id].mode);
                } else if (endpoint.includes('temperatureHeatingSetpoint')) {
                    globalState.zones[id].wantedTemp = response['value'];
                    thermostat.updateCharacteristic(globalPlatform.Characteristic.TargetTemperature, globalState.zones[id].wantedTemp);
                }
            }
            break;
        }
    }
}

async function connectAPI(serialNumber: number, accessKey: string, password: string) {
    globalClient = EasyControlClient({ serialNumber: serialNumber, accessKey: accessKey, password: password });
    await globalClient.connect().catch(error => globalLogger.error("Failed to connect to client: " + error));
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
            this.log.debug('Finished initializing platform:', this.config.name);
            // MAYBE PLACE THIS OUTSIDE?
            this.api.on('didFinishLaunching', () => {
                log.debug('Executed didFinishLaunching callback');
                // run the method to discover / register your devices as accessories
                this.discoverDevices();
            });
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    discoverDevices() {

        interface configZone {
            index: number;
            name: string;
        }

        const configZones: { string: configZone[] } = this.config['zones'];
        for (const zone of configZones.string) {
            const uuid = this.api.hap.uuid.generate(zone.index.toString());
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                // existingAccessory.context.device = device;
                // this.api.updatePlatformAccessories([existingAccessory]);

                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new Thermostat(this, existingAccessory);
                globalState.zones[zone.index].accessory = existingAccessory;

                // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
                // remove platform accessories when no longer present
                // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
            } else {
                this.log.info('Adding new accessory:', zone.name);
                const accessory = new this.api.platformAccessory(zone.name, uuid);

                accessory.context.id = zone.index;
                accessory.context.name = zone.name;

                new Thermostat(this, accessory);
                globalState.zones[zone.index].accessory = accessory;

                // link the accessory to your platform
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                this.accessories.push(accessory);
            }

        }

        setInterval(() => {
            globalLogger.info("Executing 1 min getter");
            globalClient.get('/zones/list').then((response) => {
                processResponse(response);
            });

            globalClient.get('/system/sensors/humidity/indoor_h1').then((response) => {
                processResponse(response);
            })

            globalClient.get('/gateway/localisation').then((response) => {
                processResponse(response);
            })

        }, 10000);
    }
}
