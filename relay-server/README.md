# CandleIQ read-only relay

This small Node.js service carries candle packets from reader.html to public User Chart viewers. It does not connect to QX and cannot place trades.

## Required environment settings

- READER_KEY: a long private password used only by the QX Reader page.
- PORT: normally supplied automatically by the hosting service.

## Start

Run npm install and then npm start.

After deployment:

1. Put the public wss endpoint in relay-config.json.
2. Enter the same endpoint and private READER_KEY in the QX Reader.
3. Keep the Reader tab and shared QX or TeamViewer window open.

Viewers connect without the publishing key and can only receive candle packets.
