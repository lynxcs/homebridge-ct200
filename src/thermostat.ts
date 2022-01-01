import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { CT200Platform, globalState } from './platform';
import { EP_BZ, EP_BZ_MODE, EP_BZ_TARGET_TEMP, EP_BZ_MANUAL_TEMP } from './endpoints';
import { getEndpoint, setEndpoint} from './client';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Thermostat {
    private service: Service;
    private id: number;

    constructor(
        private readonly platform: CT200Platform,
        private readonly accessory: PlatformAccessory,
    ) {

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Bosch')
            .setCharacteristic(this.platform.Characteristic.Model, 'CT200')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.platform.config['serial']);

        this.service = this.accessory.getService(this.platform.Service.Thermostat)
            || this.accessory.addService(this.platform.Service.Thermostat);

        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.name);
        this.id = this.accessory.context.id;

        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature) // Global
            .onGet(this.getCurrentTemp.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature) // Per device
            .onGet(this.getTargetTemp.bind(this))
            .onSet(this.setTargetTemp.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState) // Global
            .onGet(this.getCurrentState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState) // Per device
            .onGet(this.getTargetState.bind(this))
            .onSet(this.setTargetState.bind(this))
            .setProps({
                minValue: 1,
                maxValue: 3,
                validValues: [1, 3],
            });

        this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits) // Global
            .onGet(this.getDisplayUnits.bind(this))
            .onSet(this.setDisplayUnits.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
            .onGet(this.getRelativeHumidity.bind(this));

    }

    async getCurrentTemp(): Promise<CharacteristicValue> {
        const zone = globalState.zones.get(this.id);
        if (zone) {
            return zone.currentTemp;
        } else {
            this.platform.log.error('Zone undefined while getting current temperature!');
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getTargetTemp(): Promise<CharacteristicValue> {
        getEndpoint(EP_BZ + this.id + EP_BZ_TARGET_TEMP);

        const zone = globalState.zones.get(this.id);
        if (zone) {
            return zone.wantedTemp;
        } else {
            this.platform.log.error('Zone undefined while getting target temperature!');
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async setTargetTemp(value: CharacteristicValue) {
        setEndpoint(EP_BZ + this.id + EP_BZ_MANUAL_TEMP, String(value)).then(response => {
            if (response['status'] !== 'ok') {
                this.platform.log.error('Failed to set temperature!');
            }
        });
    }

    async getCurrentState(): Promise<CharacteristicValue> {
        const zone = globalState.zones.get(this.id);
        if (zone) {
            return zone.state;
        } else {
            this.platform.log.error('Zone undefined while getting current state!');
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async getTargetState(): Promise<CharacteristicValue> {
        getEndpoint(EP_BZ + this.id + EP_BZ_MODE);

        const zone = globalState.zones.get(this.id);
        if (zone) {
            return zone.mode;
        } else {
            this.platform.log.error('Zone undefined while getting target state!');
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
    }

    async setTargetState(value: CharacteristicValue) {
        setEndpoint(EP_BZ + this.id + EP_BZ_MODE, value === 3 ? '"clock"' : '"manual"').then(response => {
            if (response['status'] === 'ok') {
                // Update value when state is modified
                getEndpoint(EP_BZ + this.id + EP_BZ_TARGET_TEMP);
            } else {
                this.platform.log.error('Failed to set state!');
            }
        });
    }

    // Also a global property
    async getDisplayUnits(): Promise<CharacteristicValue> {
        return globalState.localization;
    }

    async setDisplayUnits(value: CharacteristicValue) {
        this.platform.log.warn('Setting temperature units to ' + value + ' failed! Change in bosch app!');
    }

    // This is a global property
    async getRelativeHumidity(): Promise<CharacteristicValue> {
        return globalState.humidity;
    }
}
