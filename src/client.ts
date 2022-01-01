import { EasyControlClient } from 'bosch-xmpp';
import { processResponse, globalLogger } from './platform';

let XMPP_CLIENT: EasyControlClient;

export async function connectAPI(serialNumber: number, accessKey: string, password: string) {
    XMPP_CLIENT = EasyControlClient({ serialNumber: serialNumber, accessKey: accessKey, password: password });
    await XMPP_CLIENT.connect().catch((e: Error) => {
        // This doesn't seem to be triggered, even when login details are incorrect
        globalLogger.error('Failed to connect client: ' + e);
        process.exit(1);
    });
}

export async function getEndpoint(endpoint: string) {
    try {
        processResponse(await XMPP_CLIENT.get(endpoint));
    } catch(e) {
        if (e instanceof Error) {
            checkError(e);
        }
    }
}

export async function setEndpoint(endpoint: string, value: string) {
    const command: string = '{"value":' + value + '}';
    globalLogger.debug('Setting', endpoint, 'to', command);

    try {
        return await XMPP_CLIENT.put(endpoint, command);
    } catch (e) {
        if (e instanceof Error) {
            checkError(e);
        }
    }
}

function checkError(error: Error) {
    if (error instanceof SyntaxError) {
        globalLogger.error('SyntaxError encountered while sending request! Double-check login details!');
    } else if (error.message === 'HTTP_TOO_MANY_REQUESTS') {
        globalLogger.warn('Spawning too many requests!');
    } else {
        globalLogger.error((error.stack || error) as string);
    }
}
