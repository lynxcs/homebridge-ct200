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

async function connectClient()
{
	await Client.connect();
}

function ct200(log, config) {
	this.log = log;
	Logger = log;
	this.name = config["name"];

	Serial = config["serial"];

	// Check if config is properly set
	if (config["serial"] == undefined)
	{
		Logger.error("Serial not set!");
		exit();
	}
	if (config["password"] == undefined)
	{
		Logger.error("Password not set!");
		exit();
	}
	if (config["access"] == undefined)
	{
		Logger.error("Access key not set!");
		exit();
	}
	if (config["name"] == undefined)
	{
		this.name = "ct200";
	}

	Client = EasyControlClient({serialNumber: config["serial"], accessKey: config["access"], password: config["password"]});
	connectClient();
}

async function tryCommandGet(command)
{
	var result;
	try {
		result = await Client.get(command);
		return result;
	} catch (e)
	{
		Logger.error("Encountered error during GET: " + command);
		Logger.error(e.stack || e);
		await Client.end();
		await Client.connect();
	}
	return result;
}

async function tryCommandPut(command, message)
{
	var result;
	try {
		result = await Client.put(command, message);
		return result
	} catch (e)
	{
		Logger.error("Encountered error during PUT: (" + command + "," + message+ ")");
		Logger.error(e.stack || e);
		await Client.end();
		await Client.connect();
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
				tryCommandGet("/zones/zn1/temperatureActual").then((value) => {
					var stringified = JSON.stringify(value);
					var temperature = JSON.parse(stringified)["value"];
					if (isNaN(temperature))
					{
						Logger.error("Temperature reported is NaN! " + temperature);
						Logger.error(stringified);
					}
					return next(null, temperature);
				});
			});

		// Target temperature
		boschService.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', function (next) {
				tryCommandGet("/zones/zn1/temperatureHeatingSetpoint").then((value) => {
					var stringified = JSON.stringify(value);
					return next(null, JSON.parse(stringified)["value"]);
				});
			})
			.on('set', function (wantedTemp, next) {
				var commandString = '{"value":' + wantedTemp + '}';
					tryCommandPut("/zones/zn1/manualTemperatureHeating", commandString).then((value) => {
						var stringified = JSON.stringify(value);
						Logger.info(stringified);
					});
					return next();
			});

		// Current heating cooling state
		boschService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
			.on('get', function (next) {
				tryCommandGet("/zones/zn1/status").then((value) => {
					// Logger.info(value);
					var stringified = JSON.stringify(value);
					var currentStatus = JSON.parse(stringified)["value"];
					if (currentStatus == "idle")
					{
						return next(null, Characteristic.CurrentHeatingCoolingState.OFF);
					}
					else if (currentStatus == "heat request")
					{
						return next(null, Characteristic.CurrentHeatingCoolingState.HEAT);
					}
					else
					{
						Logger.info("Unknown status: " + currentStatus);
						return next(null, Characteristic.CurrentHeatingCoolingState.COOL);
					}
				});
			});

		// TODO Target heating cooling state
		boschService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.on('get', function (next) {
				tryCommandGet("/zones/zn1/userMode").then((value) => {
					var stringified = JSON.stringify(value);
					var currentMode = JSON.parse(stringified)["value"];
					if (currentMode == "clock")
					{
						return next(null, Characteristic.TargetHeatingCoolingState.AUTO);
					}
					else
					{
						return next(null, Characteristic.TargetHeatingCoolingState.HEAT);
					}
				});
			})
			.on('set', function (wantedState, next) {
				var currentCharacteristic = boschService.getCharacteristic(Characteristic.TargetHeatingCoolingState);
				var currentState = currentCharacteristic.value;
				if (wantedState == Characteristic.TargetHeatingCoolingState.COOL)
				{
					wantedState = Characteristic.TargetHeatingCoolingState.HEAT;
					currentCharacteristic.updateValue(wantedState);
				}
				else if (wantedState == Characteristic.TargetHeatingCoolingState.OFF)
				{
					wantedState = Characteristic.TargetHeatingCoolingState.AUTO;
					currentCharacteristic.updateValue(wantedState);
				}

				if (wantedState != currentState) {
					var state;
					if (wantedState == Characteristic.TargetHeatingCoolingState.AUTO)
					{
						state = "clock";
					}
					else
					{
						state = "manual";
					}
					var commandString = '{"value":"' + state + '"}';
					tryCommandPut("/zones/zn1/userMode", commandString).then((value) => {
						var stringified = JSON.stringify(value);
						Logger.info(stringified);
					});
					if (wantedState == Characteristic.TargetHeatingCoolingState.AUTO) {
						tryCommandGet("/zones/zn1/temperatureHeatingSetpoint").then((value) => {
							var stringified = JSON.stringify(value);
							Logger.info(stringified);
							var targetTemp = JSON.parse(stringified)["value"];
							boschService.getCharacteristic(Characteristic.TargetTemperature).updateValue(targetTemp);
						});
					}
				}

				return next();
			});

		// Temperature display units
		boschService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
			.on('get', function (next) {
				tryCommandGet("/gateway/localisation").then((value) => {
					var stringified = JSON.stringify(value);
					var currentUnit = JSON.parse(stringified)["value"];
					if (currentUnit == "Celsius")
					{
						return next(null, Characteristic.TemperatureDisplayUnits.CELSIUS);
					}
					else
					{
						return next(null, Characteristic.TemperatureDisplayUnits.FAHRENHEIT);
					}
				});
			})
			.on('set', function (wantedUnits, next) {
				var units;
				if (wantedUnits == Characteristic.TemperatureDisplayUnits.CELSIUS)
				{
					units = "Celsius";
				}
				else
				{
					units = "Fahrenheit";
				}
				var commandString = '{"value":"' + units + '"}';
				tryCommandPut("/gateway/localisation", commandString).then((value) => {
					var stringified = JSON.stringify(value);
					Logger.info("Localisation PUT:" + stringified);
					return next();
				});
			});

		// Current relative humidity
		boschService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
			.on('get', function (next) {
				tryCommandGet("/system/sensors/humidity/indoor_h1").then((value) => {
					var stringified = JSON.stringify(value);
					var currentHumidity = JSON.parse(stringified)["value"];
					return next(null, currentHumidity);
				});
			});

		// TODO Target relative humidity (pretty sure this isn't available in bosch easyControl)

		// Away mode switch
		var awayService = new Service.Switch("Away", "away");
		awayService.getCharacteristic(Characteristic.On)
			.on('get', function (next) {
				tryCommandGet("/system/awayMode/enabled").then((value) => {
					var stringified = JSON.stringify(value);
					var enabledAway = JSON.parse(stringified)["value"];
					if (enabledAway == "false")
					{
						return next(null, 0);
					}
					else
					{
						return next(null, 1);
					}
				});
			})
			.on('set', function (wantedState, next) {
				var commandString;
				if (wantedState == 0)
				{
					commandString = '{"value":"false"}';
				}
				else
				{
					commandString = '{"value":"true"}';
				}
				tryCommandPut("/system/awayMode/enabled", commandString).then((value) =>{
					var stringified = JSON.stringify(value);
					Logger.info("Away PUT:" + stringified);
					return next();
				});
			});

		// Advance schedule button
		var advanceService = new Service.Switch("Advance", "advance");
		advanceService.getCharacteristic(Characteristic.On)
			.on('get', function (next) {
				return next(null, 0);
			})
			.on('set', function (wantedState, next) {
				if (wantedState == 1)
				{
					tryCommandGet("/zones/zn1/nextSetpoint").then((value) => {
						var stringified = JSON.stringify(value);
						var nextSetpointTemp = JSON.parse(stringified)["value"];
						boschService.getCharacteristic(Characteristic.TargetTemperature).setValue(nextSetpointTemp);
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
