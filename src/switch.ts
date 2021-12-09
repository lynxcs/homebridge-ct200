import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { CT200Platform, globalState, processResponse, globalClient } from './platform';
import { EP_AWAY, EP_ZONES } from './endpoints';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AwaySwitch {
    private service: Service;

    constructor(
        private readonly platform: CT200Platform,
        private readonly accessory: PlatformAccessory,
    ) {

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Bosch')
            .setCharacteristic(this.platform.Characteristic.Model, 'CT200')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.platform.config['serial']);

        this.service = this.accessory.getService(this.platform.Service.Switch)
            || this.accessory.addService(this.platform.Service.Switch);

        this.service.setCharacteristic(this.platform.Characteristic.Name, 'CT200 Away Mode');

        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onGet(this.getAwayStatus.bind(this))
            .onSet(this.setAwayStatus.bind(this));
    }

    async getAwayStatus(): Promise<CharacteristicValue> {
        globalClient.get(EP_AWAY).then((response) => {
            processResponse(JSON.parse(JSON.stringify(response)));
        });

        return globalState.away.state;
    }

    async setAwayStatus(value: CharacteristicValue) {
        const command = '{"value":"' + value ? 'true"}' : 'false"}';
        globalClient.put(EP_AWAY, command).then((response) => {
            if (JSON.parse(JSON.stringify(response))['status'] !== 'ok') {
                this.platform.log.error('Failed to set away mode!');
            }

            // Update zone temperatures after changing state
            globalClient.get(EP_ZONES).then((responseFollowup) => {
                processResponse(responseFollowup);
            });
        });
    }
}
