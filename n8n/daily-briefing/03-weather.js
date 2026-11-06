const s = $input.first().json;
const codes = {0:'clear sky',1:'mainly clear',2:'partly cloudy',3:'overcast',45:'fog',48:'fog',
  51:'light drizzle',53:'drizzle',55:'heavy drizzle',61:'light rain',63:'rain',65:'heavy rain',
  66:'freezing rain',67:'freezing rain',71:'light snow',73:'snow',75:'heavy snow',80:'rain showers',
  81:'rain showers',82:'violent rain showers',95:'thunderstorm',96:'thunderstorm with hail',99:'thunderstorm with hail'};
try {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${s.lat}&longitude=${s.lon}`
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max'
    + `&timezone=${encodeURIComponent(s.tz)}&forecast_days=1`;
  const r = await this.helpers.httpRequest({ url, json: true });
  const d = r.daily;
  s.sections.weather = {
    text: `${s.city}: ${codes[d.weather_code[0]] ?? 'code ' + d.weather_code[0]}, `
      + `${Math.round(d.temperature_2m_min[0])}–${Math.round(d.temperature_2m_max[0])} °C, `
      + `rain chance ${d.precipitation_probability_max[0]}%, wind up to ${Math.round(d.wind_speed_10m_max[0])} km/h`,
  };
} catch (e) {
  s.sections.weather = { error: e.message };
}
return [{ json: s }];
