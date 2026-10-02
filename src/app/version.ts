/**
 * The web port's version, read from package.json at build time (the bundler
 * inlines only this field). Shown on the Welcome page (spec 02 §12.1 port note).
 */
import { version } from '../../package.json';

export const PORT_VERSION: string = version;

/** Where the port's source lives; linked from the top right of the app. */
export const SOURCE_URL = 'https://github.com/hashseed/jasmin-port';
