# Homebridge CT200

## Homebridge plugin for Bosch Easycontrol CT200

### Introduction
This homebridge plugin exposes CT200 status allowing for heater control

**Note:** The thermostat accessory in Home app shows a single button to change the control mode. On is the same as 'Auto' mode in the bosch EasyControl App. Off is the same as 'manual'.

Changing the temperature when set on 'Auto', only changes the setpoint until the next defined setpoint is reached.

### Compatibility
While I haven't tested this for myself, the plugin apparently also works with the Buderus TC100 v2 as well as bosch radiator valves, and probably other smart thermostats that make use of boschs' EasyControl API.

### Installation
To install homebridge ct200:
- Install the plugin through Homebridge Config UI X or manually by:
```
$ sudo npm -g i homebridge-ct200
```
- Configure within Homebridge Config UI X or edit `config.json` manually e.g:
```
"platforms": [
    {
        "access": "ACCESS_KEY",
        "serial": "SERIAL_KEY",
        "password": "PASSWORD",
        "away": true,
        "zones": [
            {
                "index": 1,
                "name": "NAME1"
            },
            {
                "index": 2,
                "name": "NAME2"
            }
        ],
        "platform": "CT200"
    }
]
```
where `access` is the access key, `serial` is the serial key, both of which can be found in the bosch EasyControl app; `password` is the password used to login (**Can't be longer than 8 characters**, this is a limitation of the bosch-xmpp library, and might be fixed later).
`away` is optional (default: true), and if set to false, removes the `Away` mode switch.
For each CT200 device you want to control, add a zone, where `index` is the zone id (from 1 to X) and `name` is what will show up in the Home app.
#### Getting help
If you need help troubleshooting, create an issue and I'll try to help you fix it.
