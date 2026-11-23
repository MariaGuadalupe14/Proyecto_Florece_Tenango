const mysql = require('mysql2/promise');
const { mysqlConfig } = require('./db-config');

const pool = mysql.createPool({
    ...mysqlConfig(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
