'use strict';

// Imports dependencies and set up http server
const
    { FB_PAGE_ACCESS_TOKEN, APIAI_CLIENT} = require("./lib/consts"),
    express = require('express'),
    bodyParser = require('body-parser'),
    request = require('request'),
    apiai = require('apiai'),
    apiaiClient = apiai(APIAI_CLIENT, {language: "en", requestSource: "fb"}),
    cheerio = require("cheerio"),
    async = require("async"),
    rp = require('request-promise');
    connectDB = require('./db');

const start = async () => {
    // 3
    const DB = await connectDB();
    var app = express();
    app = express();
    app.use(bodyParser.json());

    app.set('view engine', 'pug')
    app.use(express.static('public'))

    app.get('/', async function (req, res) {

        console.log(req.query);


        const result = await DB.keywordDB.getKeyword(req.query);

        // request({
        //     uri: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/if...else",
        // }, function(error, response, body) {
        //     var $ = cheerio.load(body);

        //     // var x = $("article#wikiArticle");

        //     console.log(x.html());
        //     // var x = $(".answer .answercell .post-text").first();
        //     // x.html(x.html().replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        //     // x.find('pre').each(function () {
        //     //     var qw = $(this);
        //     //     qw.addClass('prettyprint');
        //     // });
        //     res.render('index', { title: result.title, message: result.body, code: x.html() })
        
        // });

        console.log (result.difintion);
        res.render('index', { title: result.keyword + " | " + result.language, difintion: result.difintion, details: result.details, examples: result.examples })
    })


    // Adds support for GET requests to our webhook
    app.get('/webhook', (req, res) => {
    
        // Your verify token. Should be a random string.
        let VERIFY_TOKEN = "secret"
        
        // Parse the query params
        let mode = req.query['hub.mode'];
        let token = req.query['hub.verify_token'];
        let challenge = req.query['hub.challenge'];
        
        // Checks if a token and mode is in the query string of the request
        if (mode && token) {
        
            // Checks the mode and token sent is correct
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                
                // Responds with the challenge token from the request
                console.log('WEBHOOK_VERIFIED');
                res.status(200).send(challenge);
            
            } else {
                // Responds with '403 Forbidden' if verify tokens do not match
                res.sendStatus(403);      
            }
        }
    });
    
    // Creates the endpoint for our webhook
    app.post('/webhook', async (req, res) => {  
    
        // Parse the request body from the POST
        let body = req.body;
        
        // Check the webhook event is from a Page subscription
        if (body.object === 'page') {
    
            // Iterate over each entry - there may be multiple if batched
            body.entry.forEach(function(entry) {
                console.log(JSON.stringify(entry));
                // Get the webhook event. entry.messaging is an array, but 
                // will only ever contain one event, so we get index 0
                let webhook_event = entry.messaging[0];
               
                // Get the sender PSID
                let sender_psid = webhook_event.sender.id;
    
                // Check if the event is a message or postback and
                // pass the event to the appropriate handler function
                if (webhook_event.message) {
                    await handleMessage(sender_psid, webhook_event.message);        
                } else if (webhook_event.postback) {
                    await handlePostback(sender_psid, webhook_event.postback);
                }
            });
    
            // Return a '200 OK' response to all events
            res.status(200).send('EVENT_RECEIVED');
    
        } else {
            // Return a '404 Not Found' if event is not from a page subscription
            res.sendStatus(404);
        }
    
    });


    async function handleMessage(sender_psid, received_message) {
        let response;
    
        // Checks if the message contains text
        if (received_message.text) {
            
            // Create the payload for a basic text message, which
            // will be added to the body of our request to the Send API
            var apiaiRequest = apiaiClient.textRequest(received_message.text, {
                sessionId: sender_psid,
            });
    
            apiaiRequest.on('response', async function(response) {
                if (response.result.action == "querySyntax"){
                    await typeOn(sender_psid);
                    const result = await DB.keywordDB.getKeyword(response.result.parameters);
                                        
                    response = {
                        "attachment":{
                            "type":"template",
                            "payload":{
                            "template_type":"button",
                            "text":result.difintion,
                            "buttons":[
                                {
                                "type":"web_url",
                                "url": "https://codingbot.herokuapp.com/?language=" + response.result.parameters.language +"&keyword=" + response.result.parameters.keyword + "&keywordkind=" + response.result.parameters.keywordkind,
                                "title": "More Details",
                                "webview_height_ratio": "tall"
                                }
                            ]
                            }
                        }
                    }
    
                    // Send the response message
                    await callSendMessageAPI(sender_psid, response, askForRate);
                    await typeOn(sender_psid);
                } else if (response.result.action == "listAttributes"){
                    await typeOn(sender_psid);

                    const result = await DB.keywordDB.getKeyword(response.result.parameters);
                                        
                    if (result.attributes.length == 0) {
                        await sendText(sender_psid, "It have only the global attributes");
                    } else {
                        var re = result.attributes[0].name;
                        
                        for (var i = 1; i < result.attributes.length; i++) {
                            re += "\u000A" + result.attributes[i].name;
                        }
                        
                        await sendText(sender_psid, re);
                        
                    }
                    await typeOff(sender_psid);
                } else if (response.result.action == "queryAttribute"){
                    console.log(response.result.parameters);                            
                    await typeOn(sender_psid);

                    const result = await DB.keywordDB.getKeyword(response.result.parameters);
                    
                
                    var re = "";
                    
                    for (var i = 0; i < result.attributes.length; i++) {
                        console.log(result.attributes[i].name)
                        if(result.attributes[i].name == response.result.parameters.attributeName) {
                            re = result.attributes[i].detail;
                            break;
                        }
                    }
                    
                    re = re.split("\\n");

                    async.each(re, async function(te, callback) {
                        
                            if (te.length != 0) {
                            
                                console.log(te);

                                await sendText(sender_psid, te);

                            }
                        
                        }, function(err) {
                            // if any of the file processing produced an error, err would equal that error
                            if( err ) {
                              // One of the iterations produced an error.
                              // All processing will now stop.
                              console.log('A file failed to process');
                            } else {
                              console.log('All files have been processed successfully');
                            }
                        }
                    );
                    
                    await typeOff(sender_psid);
                } else if (response.result.action == "rating") {
                    const rate = response.result.parameters.number;
    
                    console.log(rate);
                    if (rate >= 1 && rate <= 5) {
                        await DB.keywordDB.addrating(response.result.parameters.language, response.result.parameters.keyword, response.result.parameters.keywordkind, rate);
                        await sendText(sender_psid, "Thank you");
                    } else {
                        await sendText(sender_psid, "Please rate between 1 and 5");                    
                        await askForRate(sender_psid);
                    }
                } else {
                    // Send the response message
                    await sendText(sender_psid, response.result.fulfillment.speech);
                }
            });
    
            apiaiRequest.on('error', function(error) {
                console.log(error);
            });
             
            apiaiRequest.end();
    
            
        } else if (received_message.attachments) {
            // Get the URL of the message attachment
            let attachment_url = received_message.attachments[0].payload.url;
            response = {
                "attachment": {
                    "type": "template",
                    "payload": {
                    "template_type": "generic",
                    "elements": [{
                        "title": "Is this the right picture?",
                        "subtitle": "Tap a button to answer.",
                        "image_url": attachment_url,
                        "buttons": [
                        {
                            "type": "postback",
                            "title": "Yes!",
                            "payload": "yes",
                        },
                        {
                            "type": "postback",
                            "title": "No!",
                            "payload": "no",
                        },
                        {
                            "type":"web_url",
                            "url":"https://devdocs.io/#q=javascript+if",
                            "title":"Select Criteria",
                            "webview_height_ratio": "tall",
                          }
                        ],
                    }]
                    }
                }
            }
    
            // Send the response message
            await callSendMessageAPI(sender_psid, response);
        }    
    }
    
    
    async function handlePostback(sender_psid, received_postback) {
            
        // Get the payload for the postback
        let payload = received_postback.payload;
    
        // Set the response based on the postback payload
        if (payload === 'getstarted') {

            await rp({
                "uri": "https://graph.facebook.com/v2.6/" + sender_psid,
                "qs": { "access_token": FB_PAGE_ACCESS_TOKEN },
                "method": "GET",
                json: true,
            }).then( async (body) => {
                console.log(body);
                await DB.userDB.adduser(sender_psid, body.first_name);                    
                sendText(sender_psid, "Welcome " + body.first_name + "\u000AI'am CodingBot, And I'am here To help you in coding");
                
                const response = {
                    "text": "Please tell me what programming language you want to know \u000Aunfortunately we only support Html and Css for now But we want to expand to other language in the future",
                    "quick_replies": [
                        {
                            "content_type": "text",
                            "title": "html",
                            "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_RED"
                        },
                        {
                            "content_type": "text",
                            "title": "css",
                            "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_GREEN"
                        },
                        {
                            "content_type": "text",
                            "title": "suggest a new language",
                            "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_GREEN"
                        }
                    ]
                }
                callSendMessageAPI(sender_psid, response);
            }).catch( (err) => {
                console.error("Unable to get profile:" + err);
            }); 
        } else if (payload === 'yes') {
            sendText(sender_psid, "Thanks!");
        } else if (payload === 'no') {
            sendText(sender_psid, "Oops, try sending another image.");
        }
    }
    

    async function typeOn(sender_psid) {
        
        let request_body = {
            "recipient": {
                "id": sender_psid
            },
            "sender_action":"typing_on"
        }
    
        callSendAPI(request_body, sender_psid);
    }
    
    async function typeOff(sender_psid) {
        
        let request_body = {
            "recipient": {
                "id": sender_psid
            },
            "sender_action":"typing_off"
        }
    
        callSendAPI(request_body, sender_psid);
    
    }


    async function callSendMessageAPI(sender_psid, response, cb) {
        // Construct the message body
        let request_body = {
            "recipient": {
                "id": sender_psid
            },
            "message": response
        }
    
        callSendAPI(request_body, sender_psid, cb);
    }

    async function callSendAPI(request_body, sender_psid, cb) {

        // Send the HTTP request to the Messenger Platform
        await rp({
            "uri": "https://graph.facebook.com/v2.6/me/messages",
            "qs": { "access_token": FB_PAGE_ACCESS_TOKEN },
            "method": "POST",
            "json": request_body
        }).then( (body) => {
            console.log('message sent!')

            if (cb) cb(sender_psid);
        }) .catch( (err) => {
            console.error("Unable to send message:" + err);
        }); 

    }
    
    async function sendText(sender_psid, text) {
    
        const response = {
            text,
        }
    
        // Send the response message
        callSendMessageAPI(sender_psid, response);
    }
    
    
    async function askForRate(sender_psid) {
        const response = {
            "text": "Please Rate",
            "quick_replies": [
                {
                    "content_type": "text",
                    "title": "1",
                    "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_RED"
                },
                {
                    "content_type": "text",
                    "title": "2",
                    "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_GREEN"
                },
                {
                    "content_type": "text",
                    "title": "3",
                    "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_GREEN"
                },
                {
                    "content_type": "text",
                    "title": "4",
                    "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_GREEN"
                },
                {
                    "content_type": "text",
                    "title": "5",
                    "payload": "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_GREEN"
                }
            ]
        }
    
        callSendMessageAPI(sender_psid, response);
    
    }

    const PORT = process.argv[2] || 5000;
    app.listen(PORT, () => {
        console.log(`CodingBot server running on port ${PORT}.`)
    });
};




// 5
start();