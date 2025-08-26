const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Database configuration
const dbConfig = {
  host: 'web2.revacranes.com',
  user: 'po_dbuser',
  password: 'ebwgbNaiRudPPudowrEdCNA9',
  database: 'po',
  charset: 'utf8mb4'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Check if table exists on startup
async function checkTable() {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute("SHOW TABLES LIKE 'des_drg_pend_st'");
    if (rows.length > 0) {
      console.log('Table des_drg_pend_st found successfully');
      // Show table structure for debugging
      const [structure] = await connection.execute('DESCRIBE des_drg_pend_st');
      console.log('Table structure:', structure.map(col => col.Field).join(', '));
    } else {
      console.error('Table des_drg_pend_st not found!');
    }
    connection.release();
  } catch (error) {
    console.error('Database check error:', error);
  }
}

// Check table on startup
checkTable();

// Helper function to construct Gmail link
function constructGmailLink(emailId) {
  // Gmail URLs are typically: https://mail.google.com/mail/u/0/#inbox/emailId
  return `https://mail.google.com/mail/u/0/#inbox/${emailId}`;
}

// API Routes

// Test connection
app.get('/api/test', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    // Also test if our target table exists
    const [rows] = await connection.execute("SHOW TABLES LIKE 'des_drg_pend_st'");
    connection.release();
    
    if (rows.length > 0) {
      res.json({ success: true, message: 'Database connection successful and table found' });
    } else {
      res.json({ success: false, message: 'Database connected but table des_drg_pend_st not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Database connection failed', error: error.message });
  }
});

// Store email in existing table
app.post('/api/emails', async (req, res) => {
  try {
    const { emailId, subject, sender, recipient, dateReceived, content, attachments, mailType, clientId, emlFilePath } = req.body;
    
    if (!emailId || !subject || !sender) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!mailType) {
      return res.status(400).json({ success: false, message: 'Mail type is required' });
    }

    if (!clientId) {
      return res.status(400).json({ success: false, message: 'Client ID is required' });
    }

    const connection = await pool.getConnection();
    
    // Convert email date to MySQL datetime format
    const commentDate = new Date(dateReceived).toISOString().slice(0, 19).replace('T', ' ');
    const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // Use .eml file path instead of Gmail link
    // Use .eml file path with file:// protocol instead of Gmail link
    const fileLink = emlFilePath ? `file:///${emlFilePath.replace(/\\/g, '/').replace(/\s/g, '%20')}` : constructGmailLink(emailId);
    
    // Log the inputs for debugging
    console.log('Storing email with:');
    console.log('- Mail Type:', mailType);
    console.log('- Client ID:', clientId);
    console.log('- File Path:', fileLink);
    console.log('- Subject:', subject);
    
    // Insert into existing table with user-selected values
    // Use mailType for frst_sub, store .eml file path in comments_link
    // Insert into existing table with user-selected values
// Use mailType for frst_sub, store .eml file path in comments_link, store clientId in ref_cont_no
    // Generate Gmail URL
    const gmailLink = constructGmailLink(emailId);

    // Insert into existing table with user-selected values
    // Store .eml file path in comments_link, Gmail URL in comments_linkGmail, clientId in ref_cont_no
    const [result] = await connection.execute(`
      INSERT INTO des_drg_pend_st 
      (status, mech_st, assgn_mech, frst_sub, comment_dt, comments_link, comments_linkGmail, crt_dt, ref_cont_no)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'pending',           // status
      'pending',           // mech_st  
      'Devender',          // assgn_mech
      mailType,            // frst_sub (user selection: approval/cmnt/fs)
      commentDate,         // comment_dt
      fileLink,            // comments_link (.eml file path)
      gmailLink,           // comments_linkGmail (Gmail URL)
      currentDate,         // crt_dt (creation date)
      clientId             // ref_cont_no (user input client ID)
    ]);

    connection.release();

    res.json({ 
      success: true, 
      message: 'Email data stored with .eml file path successfully',
      id: result.insertId,
      file_path: fileLink,
      mail_type: mailType,
      client_id: clientId
    });
    
  } catch (error) {
    console.error('Error storing email data:', error);
    
    // Log detailed error information
    if (error.code === 'ER_NO_DEFAULT_FOR_FIELD') {
      console.error('Missing required field. Error details:', error.sqlMessage);
    } else if (error.code === 'ER_BAD_NULL_ERROR') {
      console.error('Column cannot be null. Error details:', error.sqlMessage);
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to store email data', 
      error: error.message,
      sqlError: error.sqlMessage || 'No SQL details available'
    });
  }
});

// Get all records from existing table  
app.get('/api/emails', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(`
      SELECT * FROM des_drg_pend_st 
      WHERE assgn_mech = 'Devender' AND frst_sub = 'Approved'
      ORDER BY comment_dt DESC
    `);
    connection.release();

    res.json({ success: true, records: rows });
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch records', error: error.message });
  }
});

// Get count of records
app.get('/api/emails/count', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(`
      SELECT COUNT(*) as count FROM des_drg_pend_st 
      WHERE assgn_mech = 'Devender' AND frst_sub = 'Approved'
    `);
    connection.release();

    res.json({ success: true, count: rows[0].count });
  } catch (error) {
    console.error('Error getting record count:', error);
    res.status(500).json({ success: false, message: 'Failed to get record count', error: error.message });
  }
});

// Get single record
app.get('/api/emails/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT * FROM des_drg_pend_st WHERE id = ?', [id]);
    connection.release();

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, record: rows[0] });
  } catch (error) {
    console.error('Error fetching record:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch record', error: error.message });
  }
});

// Delete record
app.delete('/api/emails/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    const [result] = await connection.execute('DELETE FROM des_drg_pend_st WHERE id = ?', [id]);
    connection.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ success: false, message: 'Failed to delete record', error: error.message });
  }
});

// Clear all records (only those created by this extension)
app.delete('/api/emails', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.execute(`
      DELETE FROM des_drg_pend_st 
      WHERE assgn_mech = 'Devender' AND frst_sub = 'Approved'
    `);
    connection.release();

    res.json({ success: true, message: 'All extension records cleared successfully' });
  } catch (error) {
    console.error('Error clearing records:', error);
    res.status(500).json({ success: false, message: 'Failed to clear records', error: error.message });
  }
});

// Get table structure (for debugging)
app.get('/api/table-structure', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [structure] = await connection.execute('DESCRIBE des_drg_pend_st');
    connection.release();
    res.json({ success: true, structure: structure });
  } catch (error) {
    console.error('Error getting table structure:', error);
    res.status(500).json({ success: false, message: 'Failed to get table structure', error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api`);
});

module.exports = app;