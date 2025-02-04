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

app.get("/", async (req, res) => {
    try {
        const result = await db.query("SELECT id, tablename, places, roomname FROM tables ORDER BY id ASC");
        const tables = result.rows;
        res.render("index", { tables });
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// API to get available times and dates based on table selection
app.get("/available-times/:tableId", async (req, res) => {
    const tableId = req.params.tableId;

    try {
        // Get the seating capacity of the table
        const tableQuery = `SELECT places FROM tables WHERE id = $1`;
        const tableResult = await db.query(tableQuery, [tableId]);

        if (tableResult.rows.length === 0) {
            return res.status(404).json({ error: "Table not found." });
        }

        const tableCapacity = tableResult.rows[0].places;

        // Get available weekend dates
        const today = new Date();
        const availableDays = [];
        for (let i = 0; i < 4 * 7; i++) {
            const date = new Date();
            date.setDate(today.getDate() + i);
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 6 || dayOfWeek === 0) { // Saturday or Sunday
                availableDays.push(date.toISOString().split("T")[0]); // YYYY-MM-DD format
            }
        }

        // Get unavailable times for this table
        const bookedTimesQuery = `
            SELECT date, time FROM booking WHERE table_id = $1
        `;
        const bookedTimesResult = await db.query(bookedTimesQuery, [tableId]);

        // Store unavailable times in a set
        const unavailableTimes = new Set();
        bookedTimesResult.rows.forEach(row => {
            unavailableTimes.add(`${row.date}-${row.time}`);
        });

        // Available time slots
        const timeSlots = ["13-15", "15-17"];

        // Generate response with available times for each date
        const availableSlots = {};
        availableDays.forEach(date => {
            availableSlots[date] = timeSlots.filter(time => !unavailableTimes.has(`${date}-${time}`));
        });

        res.json({ availableSlots, tableCapacity });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ error: "Internal Server Error" });
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
