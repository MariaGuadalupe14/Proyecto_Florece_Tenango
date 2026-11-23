const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

function mysqlConfig() {
    const config = {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    };

    if (process.env.DB_SSL === 'true') {
        config.ssl = { rejectUnauthorized: true };
        if (process.env.DB_SSL_CA) {
            const caPath = path.isAbsolute(process.env.DB_SSL_CA)
                ? process.env.DB_SSL_CA
                : path.join(__dirname, process.env.DB_SSL_CA);
            config.ssl.ca = fs.readFileSync(caPath);
        }
    }

    return config;
}

module.exports = { mysqlConfig };
