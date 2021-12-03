import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { CT200Platform } from './platform';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
    api.registerPlatform(PLATFORM_NAME, CT200Platform);
};
