import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { CT200Platform, globalState, processResponse, globalClient } from './platform';

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
        .onGet(this.getCurrentTemp.bind(this))

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
            validValues: [1, 3]
        });

        this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits) // Global
        .onGet(this.getDisplayUnits.bind(this))
        .onSet(this.setDisplayUnits.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .onGet(this.getRelativeHumidity.bind(this));

    }

    async getCurrentTemp(): Promise<CharacteristicValue> {
        return globalState.zones[this.accessory.context.id].currentTemp;
    }

    async getTargetTemp(): Promise<CharacteristicValue> {
        globalClient.get("/zones/zn" + this.id + "/temperatureHeatingSetpoint").then((response) => {
            processResponse(JSON.parse(JSON.stringify(response)));
        });
        return globalState.zones[this.id].wantedTemp;
    }

    async setTargetTemp(value: CharacteristicValue) {
        const command: string = '{"value":' + value + '}';
        globalClient.put("/zones/zn" + this.id + "/manualTemperatureHeating", command).then((response) => {
            if (JSON.parse(JSON.stringify(response))['status'] != 'ok') {
                this.platform.log.error("Failed to set temperature!");
            }
        });
    }

    async getCurrentState(): Promise<CharacteristicValue> {
        return globalState.zones[this.accessory.context.id].state;
    }

    async getTargetState(): Promise<CharacteristicValue> {
        globalClient.get("/zones/zn" + this.id + "/userMode").then((response) => {
            processResponse(JSON.parse(JSON.stringify(response)));
        });

        return globalState.zones[this.id].mode;
    }

    async setTargetState(value: CharacteristicValue) {
        const AUTO = 1;
        let commandString = '{"value":"';
        if (value == AUTO) {
            commandString += 'clock"}';
        } else {
            commandString += 'manual"}';
        }

        globalClient.put("/zones/zn" + this.id + "/userMode", commandString).then((response) => {
            if (JSON.parse(JSON.stringify(response))['status'] != 'ok') {
                this.platform.log.error("Failed to set temperature!");
            }
        });
    }

    // Also a global property
    async getDisplayUnits(): Promise<CharacteristicValue> {
        return globalState.localization;
    }

    async setDisplayUnits(value: CharacteristicValue) {
        this.platform.log.warn("Setting temperature units in Home doesn't work! Change in bosch app!");
    }

    // This is a global property
    async getRelativeHumidity(): Promise<CharacteristicValue> {
        return globalState.humidity;
    }

}
