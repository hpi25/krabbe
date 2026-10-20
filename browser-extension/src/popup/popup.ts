import { getSettings } from '../storage.ts';

const { krabbeUrl } = await getSettings();
const frame = document.querySelector<HTMLIFrameElement>('#frame');
if (frame) frame.src = `${krabbeUrl}/create`;
