import parseCurl from 'parse-curl';
import requestAsCurl from 'request-as-curl';
import {omit, mapKeys, isEqual, toLower} from 'lodash';
import express from 'express';
import {promisify} from 'util';
import {readFile, exists as fileExists} from 'fs';
import {sync as globSync} from 'glob';
import cors from 'cors';
import {parse as urlParse} from 'url';
import parsePath from 'parse-filepath';
import ignoreHeaders from './ignoreHeaders.json';

const fsReadFile = promisify(readFile);
const fsExists = promisify(fileExists);
const port = process.env.HTTP_PORT || 3000;
const useStrictComparison = process.env.USE_STRICT_COMPARISON === 'true';
const app = express();

app.use(cors());

app.all('*', async function(req, res) {
    const {status, header, response} = await responseForRequest(req);
    res.status(status);
    res.set(header);
    res.send(response);
});

app.listen(port, () => {
    console.log(`Running on ${port}`);
});

const responseForRequest = async (req) => {
    const reqParsed = parseCurlRequest(requestAsCurl(req));
    const mockCurlFiles = globSync('./mocks/**/*.curl');

    for(const mockCurlFileIndex in mockCurlFiles) {
        const fileFullPath = mockCurlFiles[mockCurlFileIndex];
        const testRequest = parseCurlRequest(await fsReadFile(fileFullPath, 'utf-8'));

        if (!useStrictComparison) {
            testRequest.header = omit(testRequest.header, Object.keys(reqParsed.header).map(toLower));
        }

        if (isEqual(testRequest, reqParsed)) {
            try {
                const {dirname, name} = parsePath(fileFullPath);
                const responseFile = `./${dirname}/${name}`;
                const response = await fsExists(`${responseFile}.res`) ? await fsReadFile(`${responseFile}.res`, 'utf-8') : '';
                const {header, status} = parseRawResponseHeaders(await fsReadFile(`${responseFile}.head`, 'utf-8'));

                return {header, status, response};
            } catch (e) {
                console.err(e)
                return {header: {}, status: 500, response: e.message};
            }
        }
    }

    return {header: {}, status: 404, response: '404'};
};

const parseRawResponseHeaders = (responseString) => {
    const responseHeaders = {header: {}, status: 200};

    responseString.split('\n').forEach((header) => {
        header = header.trim();
        const matchedResponseCode = /HTTP\/1\.1 ([0-9]+) /.exec(header);
        if (matchedResponseCode) {
            responseHeaders.status = parseInt(matchedResponseCode[1]);
        }

        const matchedResponseHeader = /([^:]+): (.*)/.exec(header);
        if (matchedResponseHeader) {
            responseHeaders.header[matchedResponseHeader[1].trim()] = matchedResponseHeader[2].trim();
        }
    });

    return responseHeaders;
};

const parseCurlRequest = (curlRequest) => {
    const requestParsed = parseCurl(curlRequest);
    requestParsed.uri = urlParse(requestParsed.url).pathname;
    delete requestParsed.url;
    requestParsed.header = mapKeys(requestParsed.header, (v, k) => toLower(k));
    requestParsed.header = omit(requestParsed.header, ignoreHeaders.map(toLower));

    return requestParsed;
};
