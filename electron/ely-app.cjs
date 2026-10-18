// Приложение Ely.by для входа через браузер (OAuth2). Регистрируется один раз автором на
// https://account.ely.by/dev/applications — тип «Сайт», Redirect URI: http://localhost:38627/ely/callback.
// Значения можно переопределить в settings.json (elyClientId / elyClientSecret / elyRedirectPort).
module.exports = {
  clientId: '',
  clientSecret: '',
  port: 38627
};
