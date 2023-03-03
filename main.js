import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { config as envConfig } from 'dotenv-safe';
envConfig();
import Persona from './persona.js';

const app = express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.listen(process.env.port, () => console.log(`\n--- Server is live and listening on port ${process.env.port}! ---\n`));

// Facebook Page Access Token
let token = process.env.fbPageToken;

// Root route. Useful for checking bot status.
app.get('/', function (req, res) {
    res.send('GPTBot is running!');
});

// Webhook setup
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === process.env.fbVerifyToken) {
        console.log('Got correct token for webhook get request');
        return res.send(req.query['hub.challenge']);
    }
    console.error('Got wrong verify token in webhook get request');
    return res.send('Error, wrong token');
});

// Post message to Facebook
async function sendTextMessage(sender, text) {

    const requestData = {
        recipient: {id: sender},
        message: {text: text},
    };

    console.log('Got message request!');
    console.log(requestData);

    try {
        await axios.post(`https://graph.facebook.com/v16.0/me/messages?access_token=${token}`, requestData);
    } catch (error) {
        console.error('Error sending messages:', error);
    }

}

// Send indicator that a message is being typed
async function sendTypingIndicator(sender, typingState) {

    const requestData = {
        recipient: {id: sender},
        sender_action: typingState ? "typing_on" : "typing_off",
    };

    try {
        await axios.post(`https://graph.facebook.com/v16.0/me/messages?access_token=${token}`, requestData);
    } catch (error) {
        console.error('Error sending typing indicator:', error);
    }

}

/* const chatbot = new Persona('insane', {
    name: "Maria"
}); */

const chatbot = new Persona();

// Handle incoming messages
app.post('/webhook/', async function (req, res) {
    let messaging_events = req.body.entry[0].messaging;
    for (let i = 0; i < messaging_events.length; i++) {
        let event = messaging_events[i];
        let sender = event.sender.id;
        if (event.message && event.message.text && !event.message.app_id) {

            await sendTypingIndicator(sender, true);

            // ! We need to handle "commands" better than... this
            // TODO: Add /system commands and find a better home for them outside the webhook route handler!

            // If the user sent the "reset" command, reset the instance
            if (event.message.text === '/bot:reset' || event.message.text === '/bot:newtopic') {
                sendTextMessage(sender, await chatbot.reset());
                return res.sendStatus(200);
            // If the user sent the "debug" command, output the Persona's state as a stringified JSON object
            if (event.message.text.startsWith('/bot:debug ')) {
                sendTextMessage(sender, await chatbot.debug(event.message.text.split(' ')[1]));
                return res.sendStatus(200);
            }

            // If the user sent the "func" command, execute the specified function in the current instance
            if (event.message.text.startsWith('/bot:func ')) {
                sendTextMessage(sender, await chatbot.func(event.message.text.split(' ')[1]));
                return res.sendStatus(200);
            }

            // If the user sent the "persona" command, init a new custom instance
            /* if (event.message.text === '/bot:persona') {
                sendTextMessage(sender, 'Not implemented');
                return res.sendStatus(200);
            } */

            // If the user sent the "rewind" command, we can rewind the chat by the number of turns provided
            if (event.message.text.startsWith('/bot:rewind ')) {
                const turnsToRewind = parseInt(event.message.text.split(' ')[1]);
                if (isNaN(turnsToRewind)) throw new Error('The rewind command requires a valid integer with the number of turns to rewind');
                sendTextMessage(sender, await chatbot.rewind(turnsToRewind));
                return res.sendStatus(200);
            }

            const gptResponse = await chatbot.sendMessage(event.message.text);
            sendTextMessage(sender, gptResponse);
        }
    }
    res.sendStatus(200);
});