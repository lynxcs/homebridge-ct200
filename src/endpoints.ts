// File contains definitions of used endpoints

// Away mode get/set endpoint
export const EP_AWAY = '/system/awayMode/enabled';

// Array of zones, with current temp and status
export const EP_ZONES = '/zones/list';

// Data localization (Celsius or Fahrenheit)
export const EP_LOCALIZATION = '/gateway/localisation';

// Relative humidity
export const EP_HUMIDITY = '/system/sensors/humidity/indoor_h1';

// Endpoints which start with /zones/zn(index)
export const EP_BZ = '/zones/zn';

// Target temperature get/set endpoint
export const EP_BZ_TARGET_TEMP = '/temperatureHeatingSetpoint';

// Target temperature
export const EP_BZ_MANUAL_TEMP = '/manualTemperatureHeating';

// Heating mode (auto/manual) get/set endpoint
export const EP_BZ_MODE = '/userMode';
