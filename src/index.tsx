import * as os from 'os';
import * as path from 'path';
import { v4 } from 'uuid';
import {Client} from 'basic-ftp';
import * as fs from 'fs/promises';
import express from 'express';
import satori from 'satori';
import React, {ReactNode} from 'react';
import { renderAsync } from '@resvg/resvg-js';
import {existsSync} from 'node:fs';

const fonts = {
    inter: {
        400: fs.readFile(path.join(__dirname, '../fonts', 'Inter-Regular.ttf'))
    },
};

const options = {
    host: '192.168.177.71',
    user: 'admin',
    password: 'admin'
};

const PATH = 'LTs SSD 1';
// const DEST = '/Users/eliyahsundstrom/Downloads';
const DEST = 'E:\\OneDrive - Lapplandsveckan\\2024\\Inspelningar 2024';
const PORT = 3154;

function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function format(downloaded: number, total: number) {
    const percentage = (downloaded / total * 100).toFixed(2);
    return `${formatBytes(downloaded)} bytes downloaded from ${formatBytes(total)} (${percentage}%)`;
}

function getPercentElement(percentage: number) {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',

                width: 72,
                height: 72,

                backgroundColor: 'black',
            }}
        >
            <span
                style={{
                    color: 'white'
                }}
            >
                {`${percentage.toFixed(1)}%`}
            </span>
        </div>
    );
}

function getBlankElement() {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',

                width: 72,
                height: 72,

                backgroundColor: 'black',
            }}
        >
            <span
                style={{
                    color: 'white',
                }}
            >
                -
            </span>
        </div>
    );
}

function getErrorElement() {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',

                width: 72,
                height: 72,

                backgroundColor: 'red',
            }}
        >
            <span
                style={{
                    color: 'white',
                }}
            >
                ERR
            </span>
        </div>
    );
}

async function generateButton(element: ReactNode) {
    const svg = await satori(
        element,
        {
            width: 72,
            height: 72,
            fonts: [
                {
                    name: 'Inter Regular',
                    // Use `fs` (Node.js only) or `fetch` to read the font as Buffer/ArrayBuffer and provide `data` here.
                    data: await fonts.inter[400],
                    weight: 400,
                    style: 'normal',
                },
            ]
        },
    );

    const image = await renderAsync(svg, {
        fitTo: {
            mode: 'width',
            value: 72,
        },
        font: {
            loadSystemFonts: false,
        },
    })

    return image.asPng();
}

function generateName() {
    const times = ['1030', '1400', '1530', '1830', '2200'];
    const days = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];

    const DELAY = 30;
    const times_minutes = times
        .map(time => parseInt(time.slice(0, 2)) * 60 + parseInt(time.slice(2)) + DELAY);

    const current = new Date();
    const minutes = current.getHours() * 60 + current.getMinutes();

    let time = '2200';
    let dayOffset = 0;
    for (let i = 0; i < times_minutes.length; i++) {
        if (minutes >= times_minutes[i]) continue;
        if (i > 0) time = times[i - 1];
        else dayOffset--;
        break;
    }

    const day = days[current.getDay() + dayOffset];
    return path.join(`2024070${current.getDay() + dayOffset} ${day}`, `${day.substring(0, 3)} ${time}`);
}

async function main(dest: string) {
    const client = new Client();
    client.ftp.verbose = true;

    await client.access(options);
    await client.cd(PATH);

    const data = await client.list();
    const files = data.filter(file => file.name.startsWith("Inspelning"));

    const file = files.pop();
    const generatedName = generateName();

    let extension = '';
    for (let i = 1; existsSync(path.join(dest, generatedName + extension + path.extname(file.name))); i++)
        extension = ' ' + i;

    const newName = generatedName + extension + path.extname(file.name);

    console.log('Downloading', file.name);
    client.trackProgress(info => {
        status.percentage = 100 * info.bytes / file.size;
        console.log(format(info.bytes, file.size));
    });

    await client.downloadTo(path.join(dest, newName), file.name);
    status.percentage = 100;

    console.log('Downloaded', file.name, 'to', path.join(dest, newName));
    client.trackProgress();
}

let status = null;
let errors = [];

const app = express();
app.post('/download', (req, res) => {
    if (status !== null) {
        res.status(409);
        return res.end('Already downloading...');
    }

    res.end('Downloading...');

    status = {
        percentage: 0,
    };

    main(DEST)
        .finally(() => status = null)
        .catch(e => {
            errors.push(e);
            setTimeout(() => errors.shift(), 1000 * 60 * 5); // Remove after 5 minutes

            console.log(e);
            console.error('Failed to download');
        });
});

app.get('/status', (req, res) => {
    if (errors.length) return res.end('Failed to download');
    if (status === null) return res.end('Not downloading...');
    res.end('Downloading...');
});

app.get('/button', async (req, res) => {
    res.contentType('image/png');

    let element = getBlankElement();
    if (errors.length) element = getErrorElement();
    if (status) element = getPercentElement(status.percentage);

    const buffer = await generateButton(element);
    res.end(buffer);
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
