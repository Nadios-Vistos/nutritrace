import { fitImageDataUrl } from './image-fit.js';

export async function prepareVisionPhoto(file) {
  const original = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const url = await fitImageDataUrl(original, 1280, 0.8, { reencode: true });
  if (!url?.startsWith('data:image/jpeg;base64,') || url.length > 5_000_000) {
    throw new Error('Unsupported photo');
  }
  return url;
}

export async function describePhoto(photo, prompt, systemPrompt, { proxy, provider, apiKey, model, baseUrl }) {
  const { callAI, callAIProxy } = await import('./aiChat.js');
  const [, mimeType, base64] = photo.match(/^data:([^;]+);base64,(.+)$/);
  let message;
  if (!proxy && provider === 'claude') {
    message = { role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
      { type: 'text', text: prompt },
    ] };
  } else if (!proxy && provider === 'gemini') {
    message = { role: 'user', content: prompt, _image: { mimeType, base64 } };
  } else {
    message = { role: 'user', content: [
      { type: 'image_url', image_url: { url: photo } },
      { type: 'text', text: prompt },
    ] };
  }
  const request = { messages: [message], systemPrompt };
  const reply = proxy ? await callAIProxy(request) : await callAI({ ...request, provider, apiKey, model, baseUrl });
  return JSON.parse(reply.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim());
}
