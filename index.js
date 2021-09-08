// homebridge-ct200
// Domas Kalinauskas 2021
var Service, Characteristic;

var Serial;
var Logger;
var Client;

const { EasyControlClient } = require('bosch-xmpp');

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-ct200", "ct200", ct200);
};

async function connectClient() {
	await Client.connect().catch(error => console.log("Failed to connect to client: " + error));
}

function ct200(log, config) {
	this.log = log;
	Logger = log;
	this.name = config["name"];

	Serial = config["serial"];

	if (config["serial"] == undefined) {
		Logger.error("Serial not set!");
		exit();
	}
	if (config["password"] == undefined) {
		Logger.error("Password not set!");
		exit();
	}
	if (config["access"] == undefined) {
		Logger.error("Access key not set!");
		exit();
	}
	if (config["name"] == undefined) {
		this.name = "ct200";
	}

	Client = EasyControlClient({ serialNumber: config["serial"], accessKey: config["access"], password: config["password"] });
	connectClient();
}

function extractJSON(value) {
	let stringified = JSON.stringify(value);
	let parsed = JSON.parse(stringified);
	return parsed;
}

function checkEndpoint(endpoint, response) {
	if (endpoint != response["id"]) {
		Logger.error("Queried endpoint " + endpoint + " but received " + response["id"]);
		return false
		// TODO: Decide how to handle this case
		// Maybe just return null(new Error("msg")); ?
	}
	return true
}

async function tryCommandGet(command) {
	let result;
	try {
		result = await Client.get(command);
		return result;
	} catch (e) {
		Logger.error("Encountered error during GET: " + command);
		Logger.error(e.stack || e);
	}
	return result;
}

async function tryCommandPut(command, message) {
	let result;
	try {
		result = await Client.put(command, message);
		return result
	} catch (e) {
		Logger.error("Encountered error during PUT: (" + command + "," + message + ")");
		Logger.error(e.stack || e);
	}
}

ct200.prototype =
{
	getServices: function () {
		var informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Manufacturer, "Bosch")
			.setCharacteristic(Characteristic.Model, "CT200")
			.setCharacteristic(Characteristic.SerialNumber, Serial);

		var boschService = new Service.Thermostat("CT200");

		// Current temperature
		boschService.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', function (next) {
				const endpoint = "/zones/zn1/temperatureActual"
				const thischar = boschService.getCharacteristic(Characteristic.CurrentTemperature);
				tryCommandGet(endpoint).then((value) => {
					let response = extractJSON(value);
					if (checkEndpoint(endpoint, response)) {
						let temperature = response["value"];
						thischar.updateValue(temperature);
					}
				});
				return next(null, thischar.value);
			});

		// Target temperature
		boschService.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', function (next) {
				const endpoint = "/zones/zn1/temperatureHeatingSetpoint";
				const thischar = boschService.getCharacteristic(Characteristic.TargetTemperature);
				tryCommandGet(endpoint).then((value) => {
					let response = extractJSON(value);
					if (checkEndpoint(endpoint, response)) {
						let targetTemperature = response["value"];
						thischar.updateValue(targetTemperature);
					}
				});
				return next(null, thischar.value);
			})
			.on('set', function (wantedTemp, next) {
				const commandString = '{"value":' + wantedTemp + '}';
				const endpoint = "/zones/zn1/manualTemperatureHeating";
				tryCommandPut(endpoint, commandString).then((value) => {
					let response = extractJSON(value);
					if (response["status"] != "ok") {
						Logger.error("Failed to set temperature!");
						Logger.error(value);
					}
				});
				return next();
			});

		// Current heating cooling state
		boschService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', function (next) {
				const endpoint = "/zones/zn1/status";
				const thischar = boschService.getCharacteristic(Characteristic.CurrentHeatingCoolingState);
				tryCommandGet(endpoint).then((value) => {
					let response = extractJSON(value);
					if (checkEndpoint(endpoint, response)) {
						let currentStatus = response["value"];
						if (currentStatus == "idle") {
							thischar.updateValue(Characteristic.CurrentHeatingCoolingState.OFF);
						}
						else if (currentStatus == "heat request") {
							thischar.updateValue(Characteristic.CurrentHeatingCoolingState.HEAT);
						}
						else {
							Logger.info("Unknown status: " + currentStatus);
							thischar.updateValue(Characteristic.CurrentHeatingCoolingState.HEAT);
						}
					}
				});
				return next(null, thischar.value);
			})

		// Target heating cooling state
		var currentState = Characteristic.TargetHeatingCoolingState.AUTO;
		boschService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.on('get', function (next) {
				const endpoint = "/zones/zn1/userMode";
				const thischar = boschService.getCharacteristic(Characteristic.TargetHeatingCoolingState);
				tryCommandGet(endpoint).then((value) => {
					let response = extractJSON(value);
					if (checkEndpoint(endpoint, response)) {
						let currentMode = response["value"];
						if (currentMode == "clock") {
							currentState = Characteristic.TargetHeatingCoolingState.AUTO;
						}
						else {
							currentState = Characteristic.TargetHeatingCoolingState.HEAT;
						}
						thischar.updateValue(currentState);
					}
				});

				return next(null, currentState);
			})
			.on('set', function (wantedState, next) {
				// TODO: Simplify this, since now only HEAT or AUTO are the only allowed values
				let currentCharacteristic = boschService.getCharacteristic(Characteristic.TargetHeatingCoolingState);

				const OFF = Characteristic.TargetHeatingCoolingState.OFF;
				const HEAT = Characteristic.TargetHeatingCoolingState.HEAT;
				const COOL = Characteristic.TargetHeatingCoolingState.COOL;
				const AUTO = Characteristic.TargetHeatingCoolingState.AUTO;

				if (wantedState == COOL) {
					wantedState = HEAT;
					currentCharacteristic.updateValue(wantedState);
				}
				else if (wantedState == OFF) {
					wantedState = AUTO;
					currentCharacteristic.updateValue(wantedState);
				}

				if (currentState == wantedState)
				{
					return next();
				}

				let state;
				if (wantedState == AUTO) {
					state = "clock";
				}
				else {
					state = "manual";
				}

				let commandString = '{"value":"' + state + '"}';
				tryCommandPut("/zones/zn1/userMode", commandString).then((value) => {
					let response = extractJSON(value);
					if (response["status"] != "ok") {
						Logger.error("Failed to set wanted heating mode!");
						Logger.error(value);
					}

					currentState = (state == "manual" ? HEAT : AUTO);
					currentCharacteristic.updateValue(currentState);

					if (state == "clock") {
						// Change temp. to match setpoint temperature
						const endpoint = "/zones/zn1/temperatureHeatingSetpoint";
						tryCommandGet(endpoint).then((value) => {
							let response = extractJSON(value);
							if (checkEndpoint(endpoint, response)) {
								let targetTemp = response["value"];
								boschService.getCharacteristic(Characteristic.TargetTemperature).updateValue(targetTemp);
							}
						});
					}
				});

				return next();
			})
			.setProps({
				minValue: 1,
				maxValue: 3,
				validValues: [1, 3]
			});


		// Temperature display units
		boschService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('get', function (next) {
				const endpoint = "/gateway/localisation"
				const thischar = boschService.getCharacteristic(Characteristic.TemperatureDisplayUnits);
				tryCommandGet(endpoint).then((value) => {
					let response = extractJSON(value);
					if (checkEndpoint(endpoint, response)) {
						let currentUnit = response["value"];
						if (currentUnit == "Celsius") {
							thischar.updateValue(Characteristic.TemperatureDisplayUnits.CELSIUS);
						}
						else {
							thischar.updateValue(Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
						}
					}
				});
				return next(null, thischar.value);
			})
			.on('set', function (wantedUnits, next) {
				let units;
				if (wantedUnits == Characteristic.TemperatureDisplayUnits.CELSIUS) {
					units = "Celsius";
				}
				else {
					units = "Fahrenheit";
				}
				let commandString = '{"value":"' + units + '"}';
				tryCommandPut("/gateway/localisation", commandString).then((value) => {
					let response = extractJSON(value);
					if (response["status"] != "ok") {
						Logger.error("Failed to set temperature display units!");
						Logger.error(value);
					}
				});
				return next();
			});

		// Current relative humidity
		boschService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
			.on('get', function (next) {
				const endpoint = "/system/sensors/humidity/indoor_h1"
				const thischar = boschService.getCharacteristic(Characteristic.CurrentRelativeHumidity);
				tryCommandGet(endpoint).then((value) => {
					let response = extractJSON(value);
					if (checkEndpoint(endpoint, response)) {
						let currentHumidity = response["value"];
						thischar.updateValue(currentHumidity);
					}
				});
				return next(null, thischar.value);
			});

		// TODO: Target relative humidity (pretty sure this isn't available in bosch easyControl)

		// Away mode switch
		var awayService = new Service.Switch("Away", "away");
		awayService.getCharacteristic(Characteristic.On)
			.on('get', function (next) {
				const endpoint = "/system/awayMode/enabled"
				const thischar = boschService.getCharacteristic(Characteristic.CurrentRelativeHumidity);
				tryCommandGet(endpoint).then((value) => {
					let response = extractJSON(value);
					if (checkEndpoint(endpoint, response)) {
						let enabledAway = response["value"];
						if (enabledAway == "false") {
							thischar.updateValue(0);
						}
						else {
							thischar.updateValue(1);
						}
					}
				});
				return next(null, thischar.value);
			})
			.on('set', function (wantedState, next) {
				let commandString;
				if (wantedState == 0) {
					commandString = '{"value":"false"}';
				}
				else {
					commandString = '{"value":"true"}';
				}

				tryCommandPut("/system/awayMode/enabled", commandString).then((value) => {
					let response = extractJSON(response);
					if (response["status"] != "ok")
					{
						Logger.error("Failed to set away mode status!");
						Logger.error(value);
					}

				});
				return next();
			});

		// Advance schedule button
		var advanceService = new Service.Switch("Advance", "advance");
		advanceService.getCharacteristic(Characteristic.On)
			.on('get', function (next) {
				return next(null, 0);
			})
			.on('set', function (wantedState, next) {
				if (wantedState == 1) {

					// Manual mode doesn't allow for setpoint advancement, so switch to auto
					if (currentState == Characteristic.TargetHeatingCoolingState.HEAT)
					{
						boschService.getCharacteristic(Characteristic.TargetHeatingCoolingState).setValue(Characteristic.TargetHeatingCoolingState.AUTO);
					}

					const endpoint = "/zones/zn1/nextSetpoint";
					tryCommandGet(endpoint).then((value) => {
						let response = extractJSON(value);
						if (checkEndpoint(endpoint, response)) {
							let nextSetpointTemp = response["value"];
							boschService.getCharacteristic(Characteristic.TargetTemperature).setValue(nextSetpointTemp);
						}
						advanceService.getCharacteristic(Characteristic.On).setValue(0);
					});
				}
				return next();
			});

		this.informationService = informationService;
		this.boschService = boschService;
		this.awayService = awayService;
		this.advanceService = advanceService
		return [informationService, boschService, awayService, advanceService];
	}
};
