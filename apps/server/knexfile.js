"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const config = {
    development: {
        client: 'postgresql',
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'andos_dev',
            user: process.env.DB_USER || 'andos',
            password: process.env.DB_PASSWORD || 'andos',
        },
        pool: {
            min: 2,
            max: 10,
        },
        migrations: {
            directory: './database/migrations',
            tableName: 'knex_migrations',
        },
        seeds: {
            directory: './database/seeds',
        },
    },
    test: {
        client: 'postgresql',
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME_TEST || 'andos_test',
            user: process.env.DB_USER || 'andos',
            password: process.env.DB_PASSWORD || 'andos',
        },
        pool: {
            min: 1,
            max: 5,
        },
        migrations: {
            directory: './database/migrations',
            tableName: 'knex_migrations',
        },
    },
    production: {
        client: 'postgresql',
        connection: {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        },
        pool: {
            min: 5,
            max: 20,
        },
        migrations: {
            directory: './database/migrations',
            tableName: 'knex_migrations',
        },
    },
};
exports.default = config;
//# sourceMappingURL=knexfile.js.map