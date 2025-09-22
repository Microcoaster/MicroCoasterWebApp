// Charger les variables d'environnement
require('dotenv').config();

const { pool } = require('./models/database');

async function checkTableStructure() {
  try {
    console.log('🔍 Vérification de la structure de la table modules...');
    
    const [rows] = await pool.execute('DESCRIBE modules');
    console.log('📋 Structure de la table modules:');
    console.table(rows);
    
    console.log('\n� Contenu actuel de la table modules:');
    const [modules] = await pool.execute('SELECT * FROM modules LIMIT 10');
    console.table(modules);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

checkTableStructure();