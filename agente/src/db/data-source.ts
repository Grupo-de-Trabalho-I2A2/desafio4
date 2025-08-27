// src/db/data-source.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  timezone: process.env.DB_TIMEZONE || 'Z',
  charset: 'utf8mb4_unicode_ci',
  synchronize: false, // tabelas já existem no MySQL
  logging: false,
  entities: [
    __dirname + '/entities/*.ts'
  ]
});
