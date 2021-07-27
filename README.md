# Homebridge CT200

## Homebridge plugin for Bosch Easycontrol CT200

### Introduction
This homebridge plugin exposes CT200 status allowing for heater control

**This plugin is still heavily WIP.** While for the most part it works correctly for setting manual / scheduled heating, changing the temperature, viewing current temperature and showing the humidity, there are still a few features that aren't complete or working, such as: changing between Celsius and Fahrenheit, the occasional random error from the bosch API.

**Another important thing: When setting heat in the homekit app, "Auto" represent scheduled heating mode and "Heating" represents manual. "Cooling" and "Off" are unused and result in undefined behaviour!

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
    }
]
```
where `name` is the name that shows up in homekit; `access` is the access key, `serial` is the serial key, both of which can be found in the bosch EasyControl app; `password` is the password used to login (**Can't be longer than 8 characters**, this is a limitation of the bosch-xmpp library, and might be fixed later)
#### Getting help
If you need help troubleshooting, create an issue and I'll try to help you fix it.
