/**
 * Servicio de Email (Mínimo)
 * En un entorno real, aquí se usaría nodemailer o un servicio como SendGrid/Resend.
 */
exports.sendEmail = async ({ to, subject, text, html }) => {
  console.log('-----------------------------------------');
  console.log(`SIMULACIÓN DE EMAIL ENVIADO A: ${to}`);
  console.log(`ASUNTO: ${subject}`);
  console.log(`MENSAJE: ${text}`);
  console.log('-----------------------------------------');
  return true;
};
