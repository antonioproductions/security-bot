require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const DISCORD_API = "https://discord.com/api/v10";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "cambia-esta-clave-por-una-muy-segura",

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  })
);

/*
  Archivos de la web
*/
app.use(express.static(path.join(__dirname, "../public")));


/*
  INICIAR SESIÓN CON DISCORD
*/
app.get("/auth/discord", (req, res) => {

  if (!process.env.DISCORD_CLIENT_ID) {
    return res.status(500).send(
      "Falta configurar DISCORD_CLIENT_ID"
    );
  }

  if (!process.env.DISCORD_REDIRECT_URI) {
    return res.status(500).send(
      "Falta configurar DISCORD_REDIRECT_URI"
    );
  }

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,

    redirect_uri:
      process.env.DISCORD_REDIRECT_URI,

    response_type: "code",

    scope: "identify guilds"
  });

  res.redirect(
    `${DISCORD_API.replace(
      "/api/v10",
      ""
    )}/oauth2/authorize?${params.toString()}`
  );
});


/*
  CALLBACK DE DISCORD
*/
app.get(
  "/auth/discord/callback",
  async (req, res) => {

    try {

      const code = req.query.code;

      if (!code) {
        return res.redirect(
          "/?error=no_code"
        );
      }


      /*
        Pedimos el token OAuth2
      */

      const tokenResponse =
        await fetch(
          `${DISCORD_API}/oauth2/token`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              new URLSearchParams({
                client_id:
                  process.env.DISCORD_CLIENT_ID,

                client_secret:
                  process.env.DISCORD_CLIENT_SECRET,

                grant_type:
                  "authorization_code",

                code: code,

                redirect_uri:
                  process.env.DISCORD_REDIRECT_URI
              })
          }
        );


      const token =
        await tokenResponse.json();


      if (!token.access_token) {

        console.error(token);

        return res.status(500).send(
          "No se pudo iniciar sesión con Discord."
        );
      }


      /*
        Información del usuario
      */

      const userResponse =
        await fetch(
          `${DISCORD_API}/users/@me`,
          {
            headers: {
              Authorization:
                `Bearer ${token.access_token}`
            }
          }
        );


      const user =
        await userResponse.json();


      /*
        Servidores del usuario
      */

      const guildResponse =
        await fetch(
          `${DISCORD_API}/users/@me/guilds`,
          {
            headers: {
              Authorization:
                `Bearer ${token.access_token}`
            }
          }
        );


      const guilds =
        await guildResponse.json();


      /*
        Guardamos la sesión
      */

      req.session.user = user;

      req.session.guilds = guilds;

      req.session.accessToken =
        token.access_token;


      /*
        Mandamos al dashboard
      */

      res.redirect(
        "/dashboard.html"
      );

    } catch (error) {

      console.error(error);

      res.status(500).send(
        "Ha ocurrido un error al iniciar sesión."
      );
    }
  }
);


/*
  INFORMACIÓN DEL USUARIO
*/
app.get("/api/me", (req, res) => {

  if (!req.session.user) {

    return res.json({
      loggedIn: false
    });

  }


  res.json({
    loggedIn: true,

    user: req.session.user
  });

});


/*
  SERVIDORES DEL USUARIO
*/
app.get("/api/guilds", (req, res) => {

  if (!req.session.user) {

    return res.status(401).json({
      error:
        "No has iniciado sesión."
    });

  }


  const guilds =
    req.session.guilds || [];


  /*
    Discord permissions:

    ADMINISTRATOR = 8
    MANAGE_GUILD = 32
  */

  const manageableGuilds =
    guilds.filter((guild) => {

      const permissions =
        BigInt(
          guild.permissions || "0"
        );

      const administrator =
        (permissions & 8n) !== 0n;

      const manageGuild =
        (permissions & 32n) !== 0n;

      return (
        administrator ||
        manageGuild
      );

    });


  res.json(
    manageableGuilds.map(
      (guild) => ({

        id: guild.id,

        name: guild.name,

        icon: guild.icon

      })
    )
  );

});


/*
  CERRAR SESIÓN
*/
app.post("/auth/logout", (req, res) => {

  req.session.destroy(() => {

    res.json({
      success: true
    });

  });

});


/*
  Iniciar servidor
*/
app.listen(
  PORT,
  () => {

    console.log(
      `Security Bot Dashboard funcionando en el puerto ${PORT}`
    );

  }
);
