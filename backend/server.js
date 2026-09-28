require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const {
  run,
  get,
  all,
  init
} = require('./database');

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ESP32_API_KEY || 'change-this-key';
const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

app.use(cors());
app.use(express.json());

const now = () => new Date().toISOString();

const today = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE
  }).format(new Date());
};

const deviceAuth = (req, res, next) => {
  if (req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({
      error: 'Invalid device API key'
    });
  }

  next();
};

/* Health check */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'smart-medicine-reminder',
    timezone: TIMEZONE,
    timestamp: now()
  });
});

/* Get medicines */
app.get('/api/medicines', async (req, res) => {
  try {
    const rows = await all(`
      SELECT
        m.*,
        s.id AS schedule_id,
        s.time,
        s.frequency,
        s.start_date,
        s.end_date,
        s.enabled,
        s.weekdays
      FROM medicines m
      LEFT JOIN schedules s
        ON s.medicine_id = m.id
      WHERE m.active = 1
      ORDER BY m.name, s.time
    `);

    res.json(rows);
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/* Get one medicine */
app.get('/api/medicines/:id', async (req, res) => {
  try {
    const medicine = await get(
      'SELECT * FROM medicines WHERE id = ?',
      [req.params.id]
    );

    if (!medicine) {
      return res.status(404).json({
        error: 'Medicine not found'
      });
    }

    medicine.schedules = await all(
      'SELECT * FROM schedules WHERE medicine_id = ?',
      [medicine.id]
    );

    res.json(medicine);
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/* Add medicine */
app.post('/api/medicines', async (req, res) => {
  const {
    name,
    dosage,
    description = '',
    time,
    frequency = 'DAILY',
    startDate = today(),
    endDate = '',
    weekdays = ''
  } = req.body;

  if (
    !name ||
    !dosage ||
    !/^[0-2]\d:[0-5]\d$/.test(time || '') ||
    !['DAILY', 'WEEKLY', 'CUSTOM'].includes(frequency)
  ) {
    return res.status(400).json({
      error: 'name, dosage, valid time (HH:MM), and frequency are required'
    });
  }

  try {
    const medicine = await run(
      `INSERT INTO medicines
        (patient_id, name, dosage, description)
       VALUES (1, ?, ?, ?)`,
      [
        name.trim(),
        dosage.trim(),
        description
      ]
    );

    await run(
      `INSERT INTO schedules
        (medicine_id, time, frequency, start_date, end_date, weekdays)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        medicine.id,
        time,
        frequency,
        startDate,
        endDate || null,
        weekdays
      ]
    );

    const created = await get(
      'SELECT * FROM medicines WHERE id = ?',
      [medicine.id]
    );

    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/* Update medicine */
app.put('/api/medicines/:id', async (req, res) => {
  const {
    name,
    dosage,
    description = '',
    time,
    frequency = 'DAILY',
    startDate = today(),
    endDate = '',
    weekdays = ''
  } = req.body;

  if (
    !name ||
    !dosage ||
    !/^[0-2]\d:[0-5]\d$/.test(time || '') ||
    !['DAILY', 'WEEKLY', 'CUSTOM'].includes(frequency)
  ) {
    return res.status(400).json({
      error: 'Invalid medicine data'
    });
  }

  try {
    const existing = await get(
      'SELECT * FROM medicines WHERE id = ?',
      [req.params.id]
    );

    if (!existing) {
      return res.status(404).json({
        error: 'Medicine not found'
      });
    }

    await run(
      `UPDATE medicines
       SET name = ?,
           dosage = ?,
           description = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        name.trim(),
        dosage.trim(),
        description,
        req.params.id
      ]
    );

    await run(
      `UPDATE schedules
       SET time = ?,
           frequency = ?,
           start_date = ?,
           end_date = ?,
           weekdays = ?
       WHERE medicine_id = ?`,
      [
        time,
        frequency,
        startDate,
        endDate || null,
        weekdays,
        req.params.id
      ]
    );

    res.json({
      message: 'Medicine updated'
    });
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/* Delete medicine */
app.delete('/api/medicines/:id', async (req, res) => {
  try {
    const result = await run(
      'UPDATE medicines SET active = 0 WHERE id = ?',
      [req.params.id]
    );

    if (!result.changes) {
      return res.status(404).json({
        error: 'Medicine not found'
      });
    }

    res.status(204).end();
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/*
  Create today's reminder rows.

  The dashboard needs a row in reminder_logs before
  the ESP32 can change its status to TRIGGERED.
*/
async function ensureTodayRows() {
  const date = today();

  const schedules = await all(
    `SELECT
       m.id AS medicine_id,
       s.id AS schedule_id,
       s.time
     FROM medicines m
     JOIN schedules s
       ON s.medicine_id = m.id
     WHERE m.active = 1
       AND s.enabled = 1
       AND s.start_date <= ?
       AND (
         s.end_date IS NULL
         OR s.end_date = ''
         OR s.end_date >= ?
       )`,
    [
      date,
      date
    ]
  );

  for (const schedule of schedules) {
    const scheduledTime = `${date}T${schedule.time}:00`;

    await run(
      `INSERT OR IGNORE INTO reminder_logs
        (medicine_id, schedule_id, scheduled_time, status)
       VALUES (?, ?, ?, ?)`,
      [
        schedule.medicine_id,
        schedule.schedule_id,
        scheduledTime,
        'PENDING'
      ]
    );
  }
}

/* Today's reminders */
async function todayRows() {
  const date = today();

  await ensureTodayRows();

  return all(
    `SELECT
       r.*,
       m.name,
       m.dosage,
       m.description,
       s.time,
       s.frequency
     FROM reminder_logs r
     JOIN medicines m
       ON m.id = r.medicine_id
     LEFT JOIN schedules s
       ON s.id = r.schedule_id
     WHERE substr(r.scheduled_time, 1, 10) = ?
     ORDER BY r.scheduled_time`,
    [date]
  );
};

/* Get today's reminders */
app.get('/api/reminders/today', async (req, res) => {
  try {
    const rows = await todayRows();
    res.json(rows);
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/* Get reminder history */
app.get('/api/reminders/history', async (req, res) => {
  try {
    const rows = await all(
      `SELECT
         r.*,
         m.name,
         m.dosage,
         m.description,
         s.time
       FROM reminder_logs r
       JOIN medicines m
         ON m.id = r.medicine_id
       LEFT JOIN schedules s
         ON s.id = r.schedule_id
       ORDER BY r.scheduled_time DESC
       LIMIT 200`
    );

    res.json(rows);
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/*
  Update or create a reminder log.

  If exact scheduled_time does not match, the latest
  PENDING or TRIGGERED reminder for that medicine is used.
  This helps when ESP32 and server timestamps differ slightly.
*/
async function setLog(body, status) {
  const {
    medicineId,
    scheduledTime,
    deviceId = 'ESP32-MED-001',
    isTest = 0
  } = body;

  if (!medicineId) {
    throw Object.assign(
      new Error('medicineId is required'),
      {
        status: 400
      }
    );
  }

  let existing = null;

  if (scheduledTime) {
    existing = await get(
      `SELECT *
       FROM reminder_logs
       WHERE medicine_id = ?
         AND scheduled_time = ?
       ORDER BY id DESC
       LIMIT 1`,
      [
        medicineId,
        scheduledTime
      ]
    );
  }

  if (!existing) {
    existing = await get(
      `SELECT *
       FROM reminder_logs
       WHERE medicine_id = ?
         AND status IN ('PENDING', 'TRIGGERED')
       ORDER BY id DESC
       LIMIT 1`,
      [medicineId]
    );
  }

  if (existing) {
    await run(
      `UPDATE reminder_logs
       SET status = ?,
           confirmed_at = CASE
             WHEN ? = 'TAKEN' THEN ?
             ELSE confirmed_at
           END,
           device_id = COALESCE(device_id, ?),
           is_test = CASE
             WHEN ? = 1 THEN 1
             ELSE is_test
           END
       WHERE id = ?`,
      [
        status,
        status,
        now(),
        deviceId,
        isTest,
        existing.id
      ]
    );

    return existing.id;
  }

  if (!scheduledTime) {
    throw Object.assign(
      new Error('scheduledTime is required for a new reminder'),
      {
        status: 400
      }
    );
  }

  const created = await run(
    `INSERT INTO reminder_logs
      (
        medicine_id,
        scheduled_time,
        triggered_at,
        confirmed_at,
        status,
        device_id,
        is_test
      )
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      medicineId,
      scheduledTime,
      now(),
      status === 'TAKEN' ? now() : null,
      status,
      deviceId,
      isTest
    ]
  );

  return created.id;
}

/* Manual taken endpoint */
app.post('/api/reminders/taken', async (req, res) => {
  try {
    const id = await setLog(req.body, 'TAKEN');

    res.status(201).json({
      id,
      status: 'TAKEN'
    });
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message
    });
  }
});

/* Manual missed endpoint */
app.post('/api/reminders/missed', async (req, res) => {
  try {
    const id = await setLog(req.body, 'MISSED');

    res.status(201).json({
      id,
      status: 'MISSED'
    });
  } catch (e) {
    res.status(e.status || 500).json({
      error: e.message
    });
  }
});

/* ESP32 schedule endpoint */
app.get('/api/esp32/schedule', deviceAuth, async (req, res) => {
  try {
    const schedules = await all(
      `SELECT
         m.id AS medicineId,
         m.name,
         m.dosage,
         m.description,
         s.time,
         s.frequency,
         s.start_date AS startDate,
         s.end_date AS endDate,
         s.weekdays
       FROM medicines m
       JOIN schedules s
         ON s.medicine_id = m.id
       WHERE m.active = 1
         AND s.enabled = 1`
    );

    const testReminders = await all(
      `SELECT
         r.id,
         r.medicine_id AS medicineId,
         r.scheduled_time AS scheduledTime,
         m.name,
         m.dosage,
         m.description
       FROM reminder_logs r
       JOIN medicines m
         ON m.id = r.medicine_id
       WHERE r.is_test = 1
         AND r.status = 'TRIGGERED'
       ORDER BY r.id DESC
       LIMIT 5`
    );

    res.json({
      deviceId: req.get('x-device-id') || 'ESP32-MED-001',
      timezone: TIMEZONE,
      schedules,
      testReminders
    });
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/*
  ESP32 event endpoint.

  Important:
  REMINDER_TRIGGERED changes the dashboard row to TRIGGERED.
  MEDICINE_TAKEN changes it to TAKEN.
  MEDICINE_MISSED changes it to MISSED.
*/
app.post('/api/esp32/events', deviceAuth, async (req, res) => {
  try {
    const {
      deviceId = 'ESP32-MED-001',
      eventType,
      eventTime = now(),
      medicineId,
      scheduledTime,
      isTest = 0
    } = req.body;

    if (!eventType) {
      return res.status(400).json({
        error: 'eventType is required'
      });
    }

    await run(
      `INSERT INTO device_events
        (device_id, event_type, event_time, payload)
       VALUES (?, ?, ?, ?)`,
      [
        deviceId,
        eventType,
        eventTime,
        JSON.stringify(req.body)
      ]
    );

    let logId = null;

    /*
      When the buzzer and LED start, ESP32 sends
      REMINDER_TRIGGERED. This makes the popup appear.
    */
    if (eventType === 'REMINDER_TRIGGERED' && medicineId) {
      let reminder = null;

      if (scheduledTime) {
        reminder = await get(
          `SELECT *
           FROM reminder_logs
           WHERE medicine_id = ?
             AND scheduled_time = ?
           ORDER BY id DESC
           LIMIT 1`,
          [
            medicineId,
            scheduledTime
          ]
        );
      }

      if (!reminder) {
        reminder = await get(
          `SELECT *
           FROM reminder_logs
           WHERE medicine_id = ?
             AND status = 'PENDING'
           ORDER BY id DESC
           LIMIT 1`,
          [medicineId]
        );
      }

      if (reminder) {
        await run(
          `UPDATE reminder_logs
           SET status = 'TRIGGERED',
               triggered_at = ?,
               device_id = ?,
               is_test = ?
           WHERE id = ?`,
          [
            now(),
            deviceId,
            isTest,
            reminder.id
          ]
        );

        logId = reminder.id;

        console.log(
          `Reminder ${reminder.id} changed to TRIGGERED`
        );
      } else {
        console.log(
          'No pending reminder found for medicine:',
          medicineId
        );
      }
    }

    /*
      When the physical button is pressed, ESP32 sends
      MEDICINE_TAKEN.
    */
    if (eventType === 'MEDICINE_TAKEN' && medicineId) {
      logId = await setLog(
        {
          medicineId,
          scheduledTime,
          deviceId,
          isTest
        },
        'TAKEN'
      );
    }

    /*
      When the reminder times out, ESP32 sends
      MEDICINE_MISSED.
    */
    if (eventType === 'MEDICINE_MISSED' && medicineId) {
      logId = await setLog(
        {
          medicineId,
          scheduledTime,
          deviceId,
          isTest
        },
        'MISSED'
      );
    }

    res.status(201).json({
      ok: true,
      message: 'Event stored',
      eventType,
      logId
    });
  } catch (e) {
    console.error('ESP32 event error:', e);

    res.status(e.status || 500).json({
      error: e.message
    });
  }
});

/* ESP32 heartbeat */
app.post('/api/esp32/heartbeat', deviceAuth, async (req, res) => {
  try {
    const {
      deviceId = 'ESP32-MED-001',
      wifiRssi = null,
      rtcStatus = 'SYNCED',
      firmwareVersion = '1.0.0'
    } = req.body;

    await run(
      `INSERT INTO devices
        (
          device_name,
          device_uid,
          last_seen,
          status,
          wifi_rssi,
          rtc_status,
          firmware_version
        )
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_uid) DO UPDATE SET
         last_seen = excluded.last_seen,
         status = 'ONLINE',
         wifi_rssi = excluded.wifi_rssi,
         rtc_status = excluded.rtc_status,
         firmware_version = excluded.firmware_version`,
      [
        'ESP32 Medicine Device',
        deviceId,
        now(),
        'ONLINE',
        wifiRssi,
        rtcStatus,
        firmwareVersion
      ]
    );

    res.json({
      ok: true
    });
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/* Device status */
app.get('/api/esp32/status', async (req, res) => {
  try {
    const device = await get(
      'SELECT * FROM devices ORDER BY id LIMIT 1'
    );

    if (!device) {
      return res.json({
        status: 'OFFLINE'
      });
    }

    if (
      device.last_seen &&
      Date.now() - new Date(device.last_seen).getTime() > 300000
    ) {
      device.status = 'OFFLINE';
    }

    res.json(device);
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/* Trigger a test reminder */
app.post('/api/test-reminder', async (req, res) => {
  try {
    const medicine = await get(
      `SELECT
         m.id,
         m.name,
         m.dosage,
         m.description,
         s.id AS schedule_id
       FROM medicines m
       JOIN schedules s
         ON s.medicine_id = m.id
       WHERE m.active = 1
       ORDER BY m.id
       LIMIT 1`
    );

    if (!medicine) {
      return res.status(400).json({
        error: 'Add a medicine first'
      });
    }

    const scheduledTime = now();

    const id = await setLog(
      {
        medicineId: medicine.id,
        scheduledTime,
        deviceId: 'ESP32-MED-001',
        isTest: 1
      },
      'TRIGGERED'
    );

    res.status(201).json({
      id,
      medicineId: medicine.id,
      status: 'TRIGGERED',
      message: 'Test reminder created'
    });
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/* Dashboard summary */
app.get('/api/dashboard', async (req, res) => {
  try {
    const medicines = await all(
      'SELECT id FROM medicines WHERE active = 1'
    );

    const rows = await todayRows();

    const device = await get(
      'SELECT * FROM devices ORDER BY id LIMIT 1'
    );

    res.json({
      totalMedicines: medicines.length,
      todayCount: rows.length,
      taken: rows.filter(row => row.status === 'TAKEN').length,
      pending: rows.filter(row =>
        ['PENDING', 'TRIGGERED'].includes(row.status)
      ).length,
      missed: rows.filter(row => row.status === 'MISSED').length,
      device: device || {
        status: 'OFFLINE'
      }
    });
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

/* Serve frontend */
app.use(
  express.static(
    path.join(__dirname, '../frontend')
  )
);

/* Start server */
init()
  .then(() => {
    app.listen(
      PORT,
      '0.0.0.0',
      () => {
        console.log(
          `Smart Medicine Reminder API running on http://localhost:${PORT}`
         );
      }
    );
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });

module.exports = app;
