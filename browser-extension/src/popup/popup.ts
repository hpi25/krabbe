import { ext } from '../platform.ts';
import { getSettings } from '../storage.ts';

document.querySelector('#open-settings')?.addEventListener('click', () => {
  ext.runtime.openOptionsPage().then(() => window.close(), console.error);
});

const { krabbeUrl } = await getSettings();
const frame = document.querySelector<HTMLIFrameElement>('#frame');
if (frame) frame.src = `${krabbeUrl}/create`;
