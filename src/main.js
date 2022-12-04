const express = require('express');
const bodyParser = require('body-parser');
const Joi = require('joi');
const pgp = require("pg-promise")();
require('dotenv').config();

const app = express();
const port = 3000;

app.use(bodyParser.json());

const dbConnectionOptions = {
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: +process.env.DB_MAX_CONNECTION
};

const createUserSchema = Joi.object({
    username: Joi.string().alphanum().min(3).max(100).required(),
});

const changeUserSchema = Joi.object({
    username: Joi.string().alphanum().min(3).max(100).required(),
    userUuid: Joi.string().uuid().required(),
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.post('/users', async (req, res) => {
    const dto = req.body;

    const validationResult = createUserSchema.validate(dto);
    if (validationResult.error) {
        res.status(400).send('Неверные входные данные');
        return;
    }

    try {
        await req.db.none('INSERT INTO users(username) VALUES (${username})', {username: dto.username});
    } catch (error) {
        if (error.constraint === 'users_username_key') {
            res.status(409).send("Пользователь с таким логином уже есть");
            return;
        }

        res.status(500).send("Неизвестная ошибка");
        return;
    }

    try {
        const createdUser = await req.db.oneOrNone('SELECT * FROM users WHERE username = ${username}', {username: dto.username});
        res.status(201).send(createdUser);
    } catch (error) {
        res.status(500).send("Неизвестная ошибка");
    }
});

app.put('/users/:userUuid', async (req, res) => {
    const userUuid = req.params.userUuid;

    const dto = req.body;

    const validationResult = changeUserSchema.validate({ ...dto, ...req.params });
    if (validationResult.error) {
        res.status(400).send('Неверные входные данные');
        return;
    }

    let user;
    try {
        user = await req.db.oneOrNone('SELECT * FROM users WHERE uuid = ${uuid}', {uuid: userUuid});
    } catch (error) {
        res.status(500).send("Неизвестная ошибка");
    }

    if (!user) {
        res.status(404).send('Пользователь не найден');
        return;
    }

    try {
        await req.db.none('UPDATE users SET username = ${username}, updated_at = current_timestamp WHERE uuid = ${uuid}', { username: dto.username, uuid: user.uuid });
    } catch (error) {
        if (error.constraint === 'users_username_key') {
            res.status(409).send("Пользователь с таким логином уже есть");
            return;
        }

        res.status(500).send("Неизвестная ошибка");
        return;
    }

    try {
        user = await req.db.oneOrNone('SELECT * FROM users WHERE uuid = ${uuid}', {uuid: userUuid});
    } catch (error) {
        res.status(500).send("Неизвестная ошибка");
    }

    res.status(200).send(user);
});

app.get('/users/:userUuid', async (req, res) => {
    const userUuid = req.params.userUuid;

    if (!userUuid) {
        res.status(400).send('Не задан uuid пользователя');
        return;
    }

    let user;
    try {
        user = await req.db.oneOrNone('SELECT * FROM users WHERE uuid = ${uuid}', {uuid: userUuid});
    } catch (error) {
        res.status(500).send("Неизвестная ошибка");
    }

    res.status(200).send(user);
});

app.get('/users', async (req, res) => {
    let users;
    try {
        users = await req.db.many('SELECT * FROM users');
    } catch (error) {
        res.status(500).send("Неизвестная ошибка");
    }
    res.status(200).send(users);
});

function bootstrap() {
    try {
        const db = pgp(dbConnectionOptions);

        app.request.db = db;

        app.listen(port, () => {
            console.log(`Example app listening on port ${port}`);
        });
    } catch (error) {
        console.error(error);
    }
}

bootstrap();