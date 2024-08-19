const nodemailer = require("nodemailer");
const path = require("path");

const sendEmail = async (
  subject,
  send_to,
  sent_from,
  reply_to,
  name,
  link,
  p1,
  p2,
  btn_text
) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    // port: 587,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  // Options for sending email
  const options = {
    to: send_to,
    from: sent_from,
    replyTo: reply_to,
    subject: subject,
    html: `
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${subject}</title>
      </head>
      <body style="background-color: rgb(240, 240, 240); padding: 24px">
        <div>
          <div>
            <div
              style="
                display: flex;
                align-items: center;
                background-color: rgb(30, 30, 255);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
              "
            >
              <p
                style="
                  font-weight: bold;
                  font-size: 22px;
                  display: flex;
                  align-items: center;
                "
              >
                EazyMart: <span style="font-size: 22px;">Your shopping place</span>
              </p>
            </div>
            <div style="padding: 4px 8px">
              <p style="font-size: 24px">
                Hello <span style="color: rgb(254, 56, 56)">${name}</span>
              </p>
              <p>${p1}</p>
              <p>${p2}</p>
              <a href="${link}">
                <button
                  style="
                    background-color: rgb(254, 56, 56);
                    color: white;
                    padding: 12px 16px;
                    border-radius: 4px;
                    border: 0;
                    cursor: pointer;
                  "
                >
                  ${btn_text}
                </button>
              </a>
            </div>
            <div style="padding: 8px 8px">
              <h4>Regards</h4>
              <h5>Team Dreamers</h5>
            </div>
          </div>
        </div>
      </body>
    </html>`,
  };

  // Send email
  transporter.sendMail(options, function (err, info) {
    if (err) {
      console.log("Error occurred while sending email:", err);
    } else {
      console.log("Email sent successfully:", info);
    }
  });
};

module.exports = sendEmail;
