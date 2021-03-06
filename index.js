import parseCurl from 'parse-curl';
import requestAsCurl from 'request-as-curl';
import {omit, pick, mapKeys, isEqual, toLower} from 'lodash';
import express from 'express';
import {promisify} from 'util';
import {readFile, exists as fileExists} from 'fs';
import {sync as globSync} from 'glob';
import cors from 'cors';
import {parse as urlParse} from 'url';
import parsePath from 'parse-filepath';
import bodyParser from 'body-parser';

import ignoreRequestHeaders from './ignoreRequestHeaders.json';
import ignoreResponseHeaders from './ignoreResponseHeaders.json';

const fsReadFile = promisify(readFile);
const fsExists = promisify(fileExists);
const port = process.env.HTTP_PORT || 3000;
const DEBUG = typeof process.env.DEBUG !== undefined ? process.env.DEBUG : true;
const useStrictComparison = process.env.USE_STRICT_COMPARISON === 'true';
const ignoreQueryString = process.env.IGNORE_QUERY_STRING === 'true';
const app = express();
const debugMessage = DEBUG ? console.log : f => f;
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // TODO: support post data similar as json body

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
    debugMessage('checking for request => ', requestAsCurl(req));
    const reqParsed = parseCurlRequest(requestAsCurl(req));
    reqParsed.body = req.body;      // this defaults to {} on every request
    debugMessage('====================================');
    debugMessage('checking for request => ', reqParsed);
    const mockCurlFiles = globSync('./mocks/**/*.curl');

    for(const mockCurlFileIndex in mockCurlFiles) {
        const fileFullPath = mockCurlFiles[mockCurlFileIndex];
        const testRequest = parseCurlRequest(await fsReadFile(fileFullPath, 'utf-8'));

        if (!useStrictComparison) {
            testRequest.header = pick(testRequest.header, Object.keys(reqParsed.header).map(toLower));
        }
        debugMessage(`comparing with request ${fileFullPath} => `, testRequest);

        if (isEqual(testRequest, reqParsed)) {
            debugMessage(`matched =>  ${fileFullPath}`);
            try {
                const {dirname, name} = parsePath(fileFullPath);
                const responseFile = `./${dirname}/${name}`;
                const response = await fsExists(`${responseFile}.res`) ? await fsReadFile(`${responseFile}.res`, 'utf-8') : '';
                const {header, status} = parseRawResponseHeaders(await fsReadFile(`${responseFile}.head`, 'utf-8'));

                return {header, status, response};
            } catch (e) {
                console.error(e);
                return {header: {}, status: 500, response: e.message};
            }
        }
    }

    debugMessage('No requests matched, returning 404');

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
            const headerName = matchedResponseHeader[1].trim();
            const headerValue = matchedResponseHeader[2].trim();
            if (headerName.toLowerCase() === 'status') {
                responseHeaders.status = headerValue;
            }
            responseHeaders.header[headerName] = headerValue;
        }
    });
    responseHeaders.header = omit(responseHeaders.header, ignoreResponseHeaders.map(toLower));

    return responseHeaders;
};

const parseCurlRequest = (curlRequest) => {
    const requestParsed = parseCurl(curlRequest);
    if (requestParsed.body) {
        try {
            requestParsed.body = JSON.parse(requestParsed.body);
        } catch (e) {}
    }
    requestParsed.body = requestParsed.body || {};
    requestParsed.uri = urlParse(requestParsed.url).pathname;
    ignoreQueryString || (requestParsed.query = urlParse(requestParsed.url, true).query || {});
    delete requestParsed.url;
    requestParsed.header = mapKeys(requestParsed.header, (v, k) => toLower(k));
    requestParsed.header = omit(requestParsed.header, ignoreRequestHeaders.map(toLower));

    return requestParsed;
};
