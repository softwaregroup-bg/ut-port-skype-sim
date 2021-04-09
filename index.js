const jwt = require('jsonwebtoken');
const { JWKS, JWK } = require('jose');

module.exports = function skypeSim(...params) {
    return class skypeSim extends require('ut-port-webhook')(...params) {
        get defaults() {
            return {
                namespace: 'skypeSim',
                path: '/apis/v3/conversations/{conversationId}/activities/{activityId?}',
                hook: 'botSim.skypeFlow',
                mode: 'reply',
                server: {
                    port: 8180
                },
                request: {
                    baseUrl: 'http://localhost:8080/skype/'
                },
                from: '29:1rq8uAkrRY0WHneB5KeI78qI8ELCx_L8X5xOaRbxMZck'
            };
        }

        handlers() {
            let lastReply;
            let id = 1;
            const key = JWK.generateSync('RSA', 2048, {kid: 'skypeSim', use: 'sig'});
            const keystore = new JWKS.KeyStore([key]);
            return {
                async start() {
                    this.httpServer.route({
                        method: 'GET',
                        path: '/jwks',
                        options: {
                            auth: false,
                            handler: async(req, h) => {
                                return h.response(keystore.toJSON());
                            }
                        }
                    });
                    this.httpServer.route({
                        method: 'GET',
                        path: '/openId',
                        options: {
                            auth: false,
                            handler: async(req, h) => {
                                return h.response({
                                    id_token_signing_alg_values_supported: ['RS256'],
                                    jwks_uri: `http://localhost:${this.config.server.port}/jwks`
                                });
                            }
                        }
                    });
                },
                [`${this.config.hook}.identity.request.receive`]: () => {
                    return {
                        clientId: this.config.clientId,
                        appId: this.config.appId,
                        platform: 'skype',
                        accessToken: this.config.accessToken
                    };
                },
                [`${this.config.hook}.message.request.receive`]: (msg) => {
                    lastReply = {
                        platform: 'skype',
                        sender: msg.from.id,
                        receiver: msg.recipient.id,
                        text: msg.text,
                        request: msg
                    };
                    return msg;
                },
                [`${this.config.namespace}.message.request.send`]: async(msg) => {
                    lastReply = undefined;
                    const timestamp = new Date().getTime();
                    const body = {
                        type: 'message',
                        timestamp: new Date().toISOString(),
                        id: timestamp + '-' + id++,
                        channelId: 'skype',
                        serviceUrl: `http://localhost:${this.config.server.port}/apis/`,
                        from: {
                            id: msg.from || this.config.from
                        },
                        conversation: {
                            id: 'conversationId'
                        },
                        recipient: {
                            id: '28:8bcc43dd-8ff0-430a-9251-7d7c2427f316',
                            name: 'SG_Bot'
                        },
                        entities: [{
                            locale: 'en-US',
                            country: 'AU',
                            platform: 'Android',
                            timezone: 'Australia/Brisbane',
                            type: 'clientInfo'
                        }],
                        locale: 'en-US'
                    };
                    switch (msg.type) {
                        case 'text':
                            body.text = msg.text;
                            body.channelData = {text: msg.text};
                            break;
                        case 'image':
                            body.attachments = [{
                                contentType: 'image',
                                contentUrl: msg.url,
                                thumbnailUrl: msg.thumbnail,
                                name: 'image.jpg'
                            }];
                            break;
                        case 'location':
                            body.text = msg.location.address;
                            body.entities.unshift({
                                address: msg.location.address,
                                geo: {
                                    type: 'GeoCoordinates',
                                    latitude: msg.location.lat,
                                    longitude: msg.location.lon
                                },
                                type: 'Place'
                            });
                            body.channelData = {
                                text: `<location isUserLocation="0" latitude="-28162439" longitude="153550047" timeStamp="1550886252991" timezone="Australia/Brisbane" locale="en-US" language="en" address="${msg.location.address}" addressFriendlyName="" shortAddress="${msg.location.address}" userMri="8:kalin.krustev"><a href="https://www.bing.com/maps/default.aspx?cp=-28.162439036179183~153.55004657059908&amp;dir=0&amp;lvl=15&amp;where1=-28.162439036179183,153.55004657059908">${msg.location.address}</a></location>`
                            };
                            body.message = {
                                type: 'location',
                                location: msg.location
                            };
                            break;
                    }
                    return {
                        url: (msg.appId || this.config.appId) + '/' + (msg.clientId || this.config.clientId),
                        body,
                        headers: {
                            authorization: 'Bearer ' + jwt.sign({
                                serviceurl: body.serviceUrl
                            }, key.toPEM(true), {
                                algorithm: 'RS256',
                                audience: (msg.appId || this.config.appId),
                                issuer: 'https://api.botframework.com',
                                keyid: 'skypeSim',
                                expiresIn: 60 * 60
                            })
                        }
                    };
                },
                [`${this.config.namespace}.message.response.receive`]: async(msg) => {
                    return {
                        httpResponse: msg,
                        reply: lastReply
                    };
                }
            };
        }
    };
};
