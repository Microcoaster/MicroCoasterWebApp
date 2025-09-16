<?php
session_start();

/* === Config BD === */
$DB_HOST = '82.66.248.144';
$DB_PORT = 3306;
$DB_USER = 'u37_DtMqNpmSJs';
$DB_PASS = 'kF.oDYVeiZyHQzSc@6ty2r=w';
$DB_NAME = 's37_MicroCoaster_WebApp';

/* === Connexion MySQLi (avec timeout) === */
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$conn = mysqli_init();
mysqli_options($conn, MYSQLI_OPT_CONNECT_TIMEOUT, 5);
mysqli_real_connect($conn, $DB_HOST, $DB_USER, $DB_PASS, $DB_NAME, $DB_PORT);
$conn->set_charset('utf8mb4');

$error = null;

/* === Soumission du formulaire === */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $code = trim($_POST['code'] ?? '');

    if ($code === '') {
        $error = 'Please enter your access code.';
    } else {
        // Sélectionne id, code, name
        $stmt = $conn->prepare('SELECT id, code, name FROM access_codes WHERE BINARY code = ? LIMIT 1');
        $stmt->bind_param('s', $code);
        $stmt->execute();

        // Variante sans mysqlnd (compatible partout)
        $stmt->bind_result($id, $codeDb, $name);
        $found = $stmt->fetch();
        $stmt->close();

        if ($found) {
            $_SESSION['user_id']  = (int)$id;
            $_SESSION['code']     = $codeDb;
            $_SESSION['nickname'] = $name;   // utilisé dans le dashboard

            header('Location: dashboard.php');
            exit;
        } else {
            $error = 'Invalid code. Please try again.';
        }
    }
}

/* === Déjà en session ? (optionnel) === */
/* Si tu veux forcer la redirection pour une session déjà ouverte, dé-commente:
if (isset($_SESSION['code'])) {
    header('Location: login.php');
    exit;
}
*/
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MicroCoaster WebApp</title>
  <link rel="stylesheet" href="styles.css">
 <link rel="shortcut icon" href="favicon.ico" type="image/x-icon"/>

</head>
<body>
  <div class="center">
    <div class="box">
      <img src="logo.png" alt="MicroCoaster logo" class="logo">
      <h1>Enter your code</h1>

      <?php if ($error): ?>
        <div class="error" style="margin:10px 0;padding:10px;border:1px solid #444;border-radius:8px;">
          <?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?>
        </div>
      <?php endif; ?>

      <form method="post" action="index.php" autocomplete="off">
        <input type="text" name="code" placeholder="Access code" required>
        <button type="submit">Continue</button>
      </form>
    </div>
  </div>
</body>
</html>
