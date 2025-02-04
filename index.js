import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import pg from 'pg';
import env from "dotenv";

env.config();

const app = express();
const port = process.env.PORT || 3000;

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});

db.connect();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Function to get available weekend days
function getAvailableDays() {
    const today = new Date();
    const days = [];
    
    for (let i = 0; i < 4 * 7; i++) {
        const date = new Date();
        date.setDate(today.getDate() + i);
        const dayOfWeek = date.getDay();

        if (dayOfWeek === 6 || dayOfWeek === 0) { // Saturday (6) or Sunday (0)
            days.push({
                date: date.toISOString().split("T")[0], // Format YYYY-MM-DD
                dayName: date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
            });
        }
    }

    return days;
}

app.get("/", async (req, res) => {
    try {
        const result = await db.query("SELECT id, tablename, places, roomname FROM tables ORDER BY id ASC");
        const tables = result.rows;
        const availableDays = getAvailableDays();
        
        res.render("index", { availableDays, tables });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Handle reservation submission
app.post("/reserve", async (req, res) => {
    const { selectedDate, selectedTime, tableId, numPeople, name, email } = req.body;

    try {
        // Check if the selected table is already reserved
        const checkQuery = `
            SELECT * FROM booking 
            WHERE table_id = $1 AND date = $2 AND time = $3
        `;
        const checkResult = await db.query(checkQuery, [tableId, selectedDate, selectedTime]);

        if (checkResult.rows.length > 0) {
            return res.send(`Sorry, Table ${tableId} is already booked for ${selectedDate} at ${selectedTime}. Please choose another.`);
        }

        // **Check if the table has enough seats**
        const tableQuery = `SELECT places FROM tables WHERE id = $1`;
        const tableResult = await db.query(tableQuery, [tableId]);

        if (tableResult.rows.length === 0) {
            return res.send("Invalid table selection.");
        }

        const availableSeats = tableResult.rows[0].places;

        if (numPeople > availableSeats) {
            return res.send(`The selected table only has ${availableSeats} seats, but you selected ${numPeople} guests.`);
        }

        // Insert the reservation into the database
        const insertQuery = `
            INSERT INTO booking (table_id, date, time, places_selected, name, email)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await db.query(insertQuery, [tableId, selectedDate, selectedTime, numPeople, name, email]);

        res.send(`Reservation confirmed for ${name} at Table ${tableId} on ${selectedDate} at ${selectedTime} for ${numPeople} people.`);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("An error occurred while processing your reservation.");
    }
});

app.listen(port, () => {
    console.log(`Server running on port http://localhost:${port}`);
});
