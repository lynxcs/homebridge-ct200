# Homebridge CT200

## Homebridge plugin for Bosch Easycontrol CT200

### Introduction
This homebridge plugin exposes CT200 status allowing for heater control

**Note:** When setting heat in the homekit app, "Auto" represent scheduled heating mode and "Heating" represents manual. "Cooling" and "Off" are disabled!

Changing the temperature when set on Auto, only changes the setpoint until the next defined setpoint is reached.

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
        "zones": [
            {
                "index": 1,
                "name": "NAME1"
            },
            {
                "index": 2,
                "name": "NAME2"
            }
            ... and so on!
        ],
        "platform": "CT200"
    }
]
```
where `access` is the access key, `serial` is the serial key, both of which can be found in the bosch EasyControl app; `password` is the password used to login (**Can't be longer than 8 characters**, this is a limitation of the bosch-xmpp library, and might be fixed later).
For each CT200 device you want to control, add a zone, where `index` is the zone id (from 1 to X) and `name` is what will show up in the Home app.
#### Getting help
If you need help troubleshooting, create an issue and I'll try to help you fix it.
