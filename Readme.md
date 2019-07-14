### HttpMock

[![Greenkeeper badge](https://badges.greenkeeper.io/hasnat/httpmock.svg)](https://greenkeeper.io/)

Mocks http requests as specified in mocks directory

Please check mocks directory for samples

###Develop
```
watch "(docker rm -f httpmock || true) \
&& docker build -t httpmock . \
&& docker run --rm --name httpmock -p 3000:3000 -e DEBUG=true httpmock" .
```