# Homebridge CT200

## Homebridge plugin for Bosch Easycontrol CT200

### Introduction
This homebridge plugin exposes CT200 status allowing for heater control

This plugin is functional enough for daily use. Might throw a few errors on lower-powered devices. There are still a few features that aren't complete or working, such as: changing between Celsius and Fahrenheit.

**Another important thing**: When setting heat in the homekit app, "Auto" represent scheduled heating mode and "Heating" represents manual. "Cooling" and "Off" are disabled!

Changing the temperature when set on Auto, only changes the setpoint until the next defined setpoint is reached (same behaviour as in the bosch EasyControl app)

### Prerequisites
A working bosch CT200, with it's temperature units set to Celsius

### Installation
To install homebridge ct200:
- Install the plugin through Homebridge Config UI X or manually by:
```
$ sudo npm -g i homebridge-ct200
```
- Edit the the `config.json` and add the `Alarm` accessory e.g:
```
"accessories": [
    {
        "accessory": "ct200",
        "name": "CT200",
        "access": "ACCESS KEY",
        "serial": "SERIAL",
        "password": "PASSWORD",
        "zone": 1 //optional
    }
]
```
where `name` is the name that shows up in homekit; `access` is the access key, `serial` is the serial key, both of which can be found in the bosch EasyControl app; `password` is the password used to login (**Can't be longer than 8 characters**, this is a limitation of the bosch-xmpp library, and might be fixed later)
`zone` can be use to change which device to show in Homekit in case, you have more devices. **Can't be run more these accessories in the same time, this is TODO for now**.
#### Getting help
If you need help troubleshooting, create an issue and I'll try to help you fix it.
