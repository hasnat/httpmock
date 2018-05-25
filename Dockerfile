FROM alpine

RUN apk --no-cache add nodejs nodejs-npm

WORKDIR /usr/local/project/app
COPY ./package.json .
RUN npm install

COPY . .

EXPOSE 3000
VOLUME ["/usr/local/project/app/mocks"]

ENTRYPOINT ["npm", "start"]