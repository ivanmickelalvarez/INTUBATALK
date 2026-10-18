const fs = require('node:fs');

function readAppOrigin(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    throw new Error(`Unable to read app origin configuration at ${filePath}: ${error.message}`, { cause: error });
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines.length !== 1 || !lines[0] || lines[0] !== lines[0].trim()) {
    throw new Error('App origin configuration must contain exactly one non-empty origin line.');
  }

  let origin;
  try {
    origin = new URL(lines[0]);
  } catch (error) {
    throw new Error(`App origin is not a valid HTTPS origin: ${error.message}`, { cause: error });
  }

  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash ||
      lines[0].includes('?') || lines[0].includes('#')) {
    throw new Error('App origin must be an HTTPS origin with no credentials, path, query, or fragment.');
  }

  return new URL(origin.origin);
}

module.exports = { readAppOrigin };
