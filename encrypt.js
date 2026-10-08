const bcrypt = require('bcrypt');

async function hashPassword(password) {
    const saltRounds = 10; 
    const hashed = await bcrypt.hash(password, saltRounds);
    console.log("Hashed password:", hashed);
}

hashPassword('123123');