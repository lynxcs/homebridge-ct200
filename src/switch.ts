import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { CT200Platform, globalState } from './platform';
import { EP_AWAY, EP_BZ, EP_BZ_TARGET_TEMP } from './endpoints';
import { getEndpoint, setEndpoint} from './client';

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
        getEndpoint(EP_AWAY);
        return globalState.away.state;
    }

    async setAwayStatus(value: CharacteristicValue) {
        const command = value ? '"true"' : '"false"';
        setEndpoint(EP_AWAY, command).then(response => {
            if (response['status'] === 'ok') {
                // Update zone temperatures after changing state
                globalState.zones.forEach((zone) => {
                    getEndpoint(EP_BZ + zone.id + EP_BZ_TARGET_TEMP);
                });
            } else {
                this.platform.log.error('Failed to set away mode!');
            }
        });
    }
}
