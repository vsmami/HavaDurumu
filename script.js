/* =========================================================
   GENEL DEĞİŞKENLER
========================================================= */
let currentLatitude = null;
let currentLongitude = null;
let currentTimezone = "auto";
let sunriseTime = null;
let nextSunriseTime = null;
let sunsetTime = null;
let clockInterval = null;
let sunInterval = null;
let locationWatchId = null;
let bestLocationAccuracy = Infinity;

/* Şehir önerileri */
let suggestionTimer = null;
let suggestionController = null;
let suggestionResults = [];
let selectedSuggestionIndex = -1;
let suggestionBox = null;

/* Harita */
let weatherMap = null;
let weatherMarker = null;
let accuracyCircle = null;
let standardMapLayer = null;
let satelliteMapLayer = null;
let currentMapStyle = "standard";
let weatherSatelliteLayer = null;
let weatherSatelliteBufferLayer = null;
let weatherSatelliteFrameRequestId = 0;
let weatherSatellitePendingLoadHandler = null;
let weatherSatellitePreloadTimeout = null;
let weatherSatelliteFadeAnimationId = 0;
let weatherSatelliteEnabled = false;
let weatherSatelliteLatestTime = null;
let weatherSatelliteSelectedIndex = 36;
let weatherSatellitePlaybackTimer = null;
let weatherSatellitePlaybackActive = false;
let weatherSatelliteTileErrorShown = false;
let weatherSatelliteTileLoadCount = 0;
let weatherSatelliteTileErrorCount = 0;
let weatherSatelliteRetryTimer = null;
let weatherSatelliteFallbackAttempts = 0;

const WEATHER_SATELLITE_STEP_MS = 20 * 60 * 1000;
const WEATHER_SATELLITE_FRAME_COUNT = 36;
const WEATHER_SATELLITE_PLAYBACK_PAUSE_MS = 1200;
const WEATHER_SATELLITE_CROSSFADE_MS = 240;
let rainRadarLayer = null;
let rainRadarFrames = [];
let rainRadarHost = "";
let rainRadarLoadedAt = 0;
let rainRadarFrameIndex = 0;
let rainRadarTimer = null;
let rainRadarEnabled = false;
let cloudOverlayLayer = null;
let temperatureOverlayLayer = null;
let temperatureOverlayRenderer = null;
let precipitationForecastLayer = null;
let precipitationForecastRenderer = null;
let cloudOverlayEnabled = false;
let temperatureOverlayEnabled = false;
let precipitationForecastEnabled = false;
let selectedWeatherForecastHour = 0;
let weatherForecastTimer = null;
let weatherGridTimer = null;
let weatherGridController = null;
let weatherGridRequestKey = null;
let weatherGridRequestId = 0;
const weatherGridCache = new Map();
let temperatureUnit = "celsius";
let windSpeedUnit = "kmh";
let lastWeatherLocation = null;
let favoriteCities = [];
let weatherDataController = null;
let weatherDataRequestId = 0;
let seaTemperatureController = null;
let openMeteoCooldownUntil = (() => {
    try {
        return Number(sessionStorage.getItem("openMeteoCooldownUntil") || 0);
    } catch {
        return 0;
    }
})();
let seaTemperatureRequestId = 0;

function formatTemperature(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "--";
    const converted = temperatureUnit === "fahrenheit"
        ? numericValue * 9 / 5 + 32
        : numericValue;
    return `${Math.round(converted)}°${temperatureUnit === "fahrenheit" ? "F" : "C"}`;
}

function formatWindSpeed(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "--";
    const converted = windSpeedUnit === "mph"
        ? numericValue / 1.609344
        : numericValue;
    return `${Math.round(converted)} ${windSpeedUnit === "mph" ? "mil/sa" : "km/sa"}`;
}

function initializeUnitPreferences() {
    const temperatureSelect = document.getElementById("temperatureUnitSelect");
    const windSelect = document.getElementById("windUnitSelect");
    try {
        const savedTemperature = localStorage.getItem("weatherTemperatureUnit");
        const savedWind = localStorage.getItem("weatherWindSpeedUnit");
        if (["celsius", "fahrenheit"].includes(savedTemperature)) temperatureUnit = savedTemperature;
        if (["kmh", "mph"].includes(savedWind)) windSpeedUnit = savedWind;
    } catch (error) {
        console.warn("Birim tercihleri kaydedilemedi:", error);
    }

    if (temperatureSelect) temperatureSelect.value = temperatureUnit;
    if (windSelect) windSelect.value = windSpeedUnit;

    const apply = () => {
        temperatureUnit = temperatureSelect?.value === "fahrenheit" ? "fahrenheit" : "celsius";
        windSpeedUnit = windSelect?.value === "mph" ? "mph" : "kmh";
        try {
            localStorage.setItem("weatherTemperatureUnit", temperatureUnit);
            localStorage.setItem("weatherWindSpeedUnit", windSpeedUnit);
        } catch (error) {
            console.warn("Birim tercihleri kaydedilemedi:", error);
        }
        if (lastWeatherLocation) {
            showWeather(
                lastWeatherLocation.latitude,
                lastWeatherLocation.longitude,
                lastWeatherLocation.cityName,
                lastWeatherLocation.country
            );
        }
    };

    temperatureSelect?.addEventListener("change", apply);
    windSelect?.addEventListener("change", apply);
}

function saveFavoriteCities() {
    try {
        localStorage.setItem("weatherFavoriteCities", JSON.stringify(favoriteCities));
    } catch (error) {
        console.error("Favori şehirler kaydedilemedi:", error);
        alert("Favoriler tarayıcıya kaydedilemedi.");
    }
}

function isFavoriteCity(location) {
    if (!location) return false;
    const normalize = value => String(value || "").trim().toLocaleLowerCase("tr-TR");
    return favoriteCities.some(city =>
        (normalize(city.cityName) === normalize(location.cityName) &&
            normalize(city.country) === normalize(location.country)) ||
        (Math.abs(Number(city.latitude) - Number(location.latitude)) < 0.02 &&
            Math.abs(Number(city.longitude) - Number(location.longitude)) < 0.02)
    );
}

function updateCurrentFavoriteButton() {
    const button = document.getElementById("currentFavoriteButton");
    if (!button) return;
    const saved = isFavoriteCity(lastWeatherLocation);
    button.disabled = !lastWeatherLocation;
    button.classList.toggle("active", saved);
    button.setAttribute("aria-pressed", String(saved));
    button.textContent = saved ? "★ Favorilerden çıkar" : "☆ Favorilere ekle";
}

function renderFavoriteCities() {
    const list = document.getElementById("savedCitiesList");
    const count = document.getElementById("favoriteCityCount");
    if (count) count.textContent = String(favoriteCities.length);
    if (!list) return;
    list.replaceChildren();

    if (!favoriteCities.length) {
        const empty = document.createElement("div");
        empty.className = "saved-city-empty";
        empty.textContent = "Henüz favori şehir eklenmedi.";
        list.appendChild(empty);
        return;
    }

    favoriteCities.forEach((city, index) => {
        const item = document.createElement("div");
        item.className = "saved-city-item";

        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.className = "saved-city-main";
        selectButton.setAttribute("aria-label", `${city.cityName} hava durumunu göster`);

        const name = document.createElement("span");
        name.className = "saved-city-name";
        name.textContent = city.cityName || "Şehir";
        const meta = document.createElement("span");
        meta.className = "saved-city-meta";
        meta.textContent = city.country || `${Number(city.latitude).toFixed(2)}, ${Number(city.longitude).toFixed(2)}`;
        selectButton.append(name, meta);
        selectButton.addEventListener("click", () => {
            document.getElementById("savedCitiesPanel")?.classList.remove("show");
            document.getElementById("savedCitiesToggle")?.setAttribute("aria-expanded", "false");
            showWeather(city.latitude, city.longitude, city.cityName, city.country || "");
        });

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "saved-city-remove";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", `${city.cityName} favorisini kaldır`);
        removeButton.addEventListener("click", () => {
            favoriteCities.splice(index, 1);
            saveFavoriteCities();
            renderFavoriteCities();
            updateCurrentFavoriteButton();
        });

        item.append(selectButton, removeButton);
        list.appendChild(item);
    });
}

function initializeFavoriteCities() {
    try {
        const stored = JSON.parse(localStorage.getItem("weatherFavoriteCities") || "[]");
        if (Array.isArray(stored)) {
            favoriteCities = stored.filter(city =>
                city && Number.isFinite(Number(city.latitude)) && Number.isFinite(Number(city.longitude)) && city.cityName
            ).slice(0, 20);
        }
    } catch (error) {
        console.warn("Favori şehir verileri okunamadı:", error);
        favoriteCities = [];
    }

    document.getElementById("savedCitiesToggle")?.addEventListener("click", event => {
        const button = event.currentTarget;
        const panel = document.getElementById("savedCitiesPanel");
        const isOpen = panel?.classList.toggle("show") || false;
        button.setAttribute("aria-expanded", String(isOpen));
    });

    document.getElementById("currentFavoriteButton")?.addEventListener("click", () => {
        if (!lastWeatherLocation) return;
        if (isFavoriteCity(lastWeatherLocation)) {
            const normalize = value => String(value || "").trim().toLocaleLowerCase("tr-TR");
            const index = favoriteCities.findIndex(city =>
                (normalize(city.cityName) === normalize(lastWeatherLocation.cityName) && normalize(city.country) === normalize(lastWeatherLocation.country)) ||
                (Math.abs(Number(city.latitude) - Number(lastWeatherLocation.latitude)) < 0.02 && Math.abs(Number(city.longitude) - Number(lastWeatherLocation.longitude)) < 0.02)
            );
            if (index >= 0) favoriteCities.splice(index, 1);
        } else if (favoriteCities.length < 20) {
            favoriteCities.unshift({ ...lastWeatherLocation });
        } else {
            alert("En fazla 20 favori şehir kaydedebilirsin.");
            return;
        }

        saveFavoriteCities();
        renderFavoriteCities();
        updateCurrentFavoriteButton();
    });

    renderFavoriteCities();
    updateCurrentFavoriteButton();
}

/* =========================================================
   ŞEHİR ARAMA
========================================================= */
async function getWeather() {
    const input = document.getElementById("cityInput");
    if (!input) return;

    const city = input.value.trim();

    if (!city) {
        alert("Lütfen bir şehir adı gir.");
        return;
    }

    closeSuggestions();

    try {
        const response = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=tr&format=json`
        );

        if (!response.ok) {
            throw new Error("Şehir bulunamadı.");
        }

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            alert("Bu şehir bulunamadı.");
            return;
        }

        const result = data.results[0];

        currentLatitude = result.latitude;
        currentLongitude = result.longitude;
        currentTimezone = result.timezone || "auto";

        input.value = result.name || city;

        await showWeather(
            result.latitude,
            result.longitude,
            result.name,
            result.country || ""
        );

    } catch (error) {
        console.error(error);
        alert("Şehir hava durumu alınamadı.");
    }
}

function getSuggestionLabel(result) {
    return [
        result.name,
        result.admin1,
        result.country
    ]
        .filter(Boolean)
        .filter(
            (value, index, array) =>
                array.indexOf(value) === index
        )
        .join(" • ");
}

function ensureSuggestionBox() {
    if (suggestionBox) return suggestionBox;

    const input = document.getElementById("cityInput");
    if (!input) return null;

    const searchArea = input.closest(".search-area");
    if (!searchArea) return null;

    searchArea.classList.add("search-area-suggestions");

    // HTML'de bulunan kutuyu kullan; aynı ID ile ikinci bir öğe oluşturma.
    suggestionBox = document.getElementById("citySuggestionBox");
    if (!suggestionBox) {
        suggestionBox = document.createElement("div");
        suggestionBox.id = "citySuggestionBox";
        suggestionBox.className = "city-suggestion-box";
        document.body.appendChild(suggestionBox);
    } else if (suggestionBox.parentElement !== document.body) {
        document.body.appendChild(suggestionBox);
    }

    suggestionBox.setAttribute("role", "listbox");
    positionSuggestionBox();
    return suggestionBox;
}

function renderSuggestions(results) {
    const box = ensureSuggestionBox();

    if (!box) {
        return;
    }

    box.innerHTML = "";
    selectedSuggestionIndex = -1;

    if (!results.length) {
        box.classList.remove("show");
        return;
    }

    results.forEach((result, index) => {
        const item = document.createElement("button");

        item.type = "button";
        item.className = "city-suggestion-item";
        item.setAttribute("role", "option");

        const icon = document.createElement("span");

        icon.className = "city-suggestion-icon";
        icon.textContent = "📍";

        const textWrap = document.createElement("span");

        textWrap.className = "city-suggestion-text";

        const city = document.createElement("strong");

        city.textContent =
            result.name || "Bilinmeyen şehir";

        const meta = document.createElement("small");

        meta.textContent =
            getSuggestionLabel(result);

        textWrap.appendChild(city);
        textWrap.appendChild(meta);

        item.appendChild(icon);
        item.appendChild(textWrap);

        item.addEventListener("mouseenter", () => {
            setSuggestionActive(index);
        });

        item.addEventListener("mousedown", event => {
            event.preventDefault();
        });

        item.addEventListener("click", async () => {
            await selectSuggestion(index);
        });

        box.appendChild(item);
    });

    box.classList.add("show");

    positionSuggestionBox();
}

function setSuggestionActive(index) {
    const box = ensureSuggestionBox();

    if (!box) {
        return;
    }

    const items = [
        ...box.querySelectorAll(
            ".city-suggestion-item"
        )
    ];

    if (!items.length) {
        return;
    }

    selectedSuggestionIndex =
        Math.max(
            0,
            Math.min(
                index,
                items.length - 1
            )
        );

    items.forEach((item, itemIndex) => {
        item.classList.toggle(
            "active",
            itemIndex === selectedSuggestionIndex
        );
    });
}

async function selectSuggestion(index) {
    const result = suggestionResults[index];

    if (!result) {
        return;
    }

    const input =
        document.getElementById("cityInput");

    if (input) {
        input.value = result.name || "";
    }

    closeSuggestions();

    currentLatitude = result.latitude;
    currentLongitude = result.longitude;
    currentTimezone =
        result.timezone || "auto";

    await showWeather(
        result.latitude,
        result.longitude,
        result.name || "Konum",
        result.country || ""
    );
}

function closeSuggestions() {
    if (suggestionBox) {
        suggestionBox.classList.remove("show");
        suggestionBox.innerHTML = "";
    }

    suggestionResults = [];
    selectedSuggestionIndex = -1;
}

async function fetchCitySuggestions(query) {
    const cleanQuery = query.trim();

    if (cleanQuery.length < 2) {
        closeSuggestions();
        return;
    }

    if (suggestionController) {
        suggestionController.abort();
    }

    suggestionController =
        new AbortController();

    try {
        const response = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=8&language=tr&format=json`,
            {
                signal:
                    suggestionController.signal
            }
        );

        if (!response.ok) {
            return;
        }

        const data = await response.json();

        const results =
            Array.isArray(data.results)
                ? data.results
                : [];

        suggestionResults = results;

        renderSuggestions(results);

    } catch (error) {
        if (error.name !== "AbortError") {
            console.error(
                "Şehir önerileri:",
                error
            );
        }
    }
}

function initializeCityAutocomplete() {
    const input =
        document.getElementById("cityInput");

    if (!input) {
        return;
    }

    const oldList =
        document.getElementById(
            "citySuggestions"
        );

    if (oldList) {
        oldList.remove();
    }

    input.removeAttribute("list");

    ensureSuggestionBox();

    input.addEventListener("input", () => {
        clearTimeout(suggestionTimer);

        const value = input.value;

        if (value.trim().length < 2) {
            closeSuggestions();
            return;
        }

        suggestionTimer = setTimeout(() => {
            fetchCitySuggestions(value);
        }, 250);
    });

    input.addEventListener(
        "keydown",
        async event => {

            const boxVisible =
                suggestionBox &&
                suggestionBox.classList.contains(
                    "show"
                );

            if (
                boxVisible &&
                event.key === "ArrowDown"
            ) {
                event.preventDefault();

                const next =
                    selectedSuggestionIndex + 1;

                setSuggestionActive(next);

                return;
            }

            if (
                boxVisible &&
                event.key === "ArrowUp"
            ) {
                event.preventDefault();

                const next =
                    selectedSuggestionIndex <= 0
                        ? suggestionResults.length - 1
                        : selectedSuggestionIndex - 1;

                setSuggestionActive(next);

                return;
            }

            if (
                boxVisible &&
                event.key === "Enter" &&
                selectedSuggestionIndex >= 0
            ) {
                event.preventDefault();

                await selectSuggestion(
                    selectedSuggestionIndex
                );

                return;
            }

            if (event.key === "Escape") {
                closeSuggestions();
                return;
            }

            if (event.key === "Enter") {
                getWeather();
            }
        }
    );

    input.addEventListener("focus", () => {
        if (suggestionResults.length) {
            renderSuggestions(
                suggestionResults
            );
        }
    });

    document.addEventListener("click", event => {
        if (
            !event.target.closest(
                ".search-area"
            )
        ) {
            closeSuggestions();
        }
    });
}

/* =========================================================
   KONUMUMU KULLAN
========================================================= */
function getMyLocation() {
    if (!navigator.geolocation) {
        alert("Tarayıcın konum özelliğini desteklemiyor.");
        return;
    }

    const locationButton = document.querySelector(".location-btn");
    if (locationButton?.disabled) return;
    if (locationButton) {
        locationButton.disabled = true;
        locationButton.textContent = "📍 Konum aranıyor...";
    }

    navigator.geolocation.getCurrentPosition(
        async position => {
            const { latitude, longitude, accuracy } = position.coords;
            currentLatitude = latitude;
            currentLongitude = longitude;

            try {
                // Reverse geocoding is optional; never let it block the weather request.
                const locationPromise = reverseGeocode(latitude, longitude).catch(error => {
                    console.warn("Konum adı bulunamadı; koordinatlarla devam ediliyor:", error);
                    return null;
                });

                await showWeather(latitude, longitude, "Bulunduğun konum", "");
                updateLocationMap(latitude, longitude, "Bulunduğun konum", null, accuracy);

                void locationPromise.then(location => {
                    if (currentLatitude !== latitude || currentLongitude !== longitude) return;
                    const cityName = location?.city || location?.province;
                    if (!cityName) return;

                    setText("cityName", cityName);
                    if (lastWeatherLocation) lastWeatherLocation.cityName = cityName;
                    updateCurrentFavoriteButton();
                    updateLocationMap(latitude, longitude, cityName, null, accuracy);
                });

                if (locationButton) {
                    locationButton.disabled = false;
                    locationButton.textContent = "📍 Konumumu Kullan";
                }
            } catch (error) {
                console.error("Konum hava durumu yüklenemedi:", error);
                if (locationButton) {
                    locationButton.disabled = false;
                    locationButton.textContent = "📍 Konumumu Kullan";
                }
                alert("Konum için hava durumu alınamadı.");
            }
        },
        error => {
            console.error("Konum hatası:", error);
            if (locationButton) {
                locationButton.disabled = false;
                locationButton.textContent = "📍 Konumumu Kullan";
            }

            if (error.code === 1) {
                alert("Konum izni verilmedi. Tarayıcıdan konum iznini aç.");
            } else if (error.code === 2) {
                alert("Konum belirlenemedi.");
            } else if (error.code === 3) {
                alert("Konum alınırken zaman aşımı oldu. Tekrar dene.");
            } else {
                alert("Konum alınamadı.");
            }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
}
/* =========================================================
   TERS GEOCODING
========================================================= */
async function reverseGeocode(
    latitude,
    longitude
) {

    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&accept-language=tr`
    );

    if (!response.ok) {
        return {};
    }

    const data =
        await response.json();

    const address =
        data.address || {};

    return {

        city:
            address.city ||
            address.town ||
            address.municipality ||
            address.village ||
            address.county ||
            "",

        province:
            address.province ||
            address.state ||
            address.region ||
            ""
    };
}

const WEATHER_SESSION_CACHE_TTL_MS = 15 * 60 * 1000;
const WEATHER_SESSION_CACHE_STALE_LIMIT_MS = 6 * 60 * 60 * 1000;

function readSessionApiCache(key) {
    try {
        const entry = JSON.parse(sessionStorage.getItem(key) || "null");
        return entry && Number.isFinite(entry.savedAt) && entry.data ? entry : null;
    } catch {
        return null;
    }
}

function writeSessionApiCache(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (error) {
        console.warn("Hava durumu oturum önbelleğine yazılamadı:", error);
    }
}

function registerOpenMeteoRateLimit(response) {
    const retryAfter = response.headers.get("Retry-After");
    const retrySeconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
    const retryDate = retryAfter && retrySeconds === null ? Date.parse(retryAfter) : NaN;
    const fallbackWait = 5 * 60 * 1000;
    openMeteoCooldownUntil = Number.isFinite(retryDate)
        ? retryDate
        : Date.now() + (retrySeconds === null ? fallbackWait : Math.max(60, retrySeconds) * 1000);
    try {
        sessionStorage.setItem("openMeteoCooldownUntil", String(openMeteoCooldownUntil));
    } catch {}
}

/* =========================================================
   HAVA DURUMU
========================================================= */

/* Gündüz/gece hesaplama yardımcı fonksiyonu */
function resolveIsDay(isDay, sunrise, sunset, currentTime) {
    if (!currentTime) {
        return Boolean(isDay);
    }

    const currentMs = new Date(currentTime).getTime();
    const sunriseMs = new Date(sunrise).getTime();
    const sunsetMs = new Date(sunset).getTime();

    if (
        Number.isFinite(currentMs) &&
        Number.isFinite(sunriseMs) &&
        Number.isFinite(sunsetMs)
    ) {
        return currentMs >= sunriseMs && currentMs < sunsetMs;
    }

    return Boolean(isDay);
}

async function showWeather(
    latitude,
    longitude,
    cityName,
    country
) {

    weatherDataController?.abort();
    const requestController = new AbortController();
    weatherDataController = requestController;
    const requestId = ++weatherDataRequestId;
    seaTemperatureController?.abort();
    seaTemperatureController = null;
    seaTemperatureRequestId += 1;

    try {
        const signal = requestController.signal;
        const roundedLocation = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
        const cachedWeather = readSessionApiCache(`weather-v1:${roundedLocation}`);
        const cachedWeatherAge = cachedWeather ? Date.now() - cachedWeather.savedAt : Infinity;
        const hasUsableStaleWeather = Boolean(cachedWeather?.data?.current && cachedWeatherAge <= WEATHER_SESSION_CACHE_STALE_LIMIT_MS);
        let usedStaleWeatherCache = false;
        let weatherDataFromNetwork = false;
        let weatherPromise;

        if (cachedWeather?.data?.current && cachedWeatherAge <= WEATHER_SESSION_CACHE_TTL_MS) {
            weatherPromise = Promise.resolve(cachedWeather.data);
        } else if (openMeteoCooldownUntil > Date.now()) {
            if (hasUsableStaleWeather) {
                usedStaleWeatherCache = true;
                weatherPromise = Promise.resolve(cachedWeather.data);
            } else {
                const waitMinutes = Math.max(1, Math.ceil((openMeteoCooldownUntil - Date.now()) / 60000));
                weatherPromise = Promise.reject(new Error(`Open-Meteo istek sınırı nedeniyle beklemede. Yaklaşık ${waitMinutes} dakika sonra tekrar dene.`));
            }
        } else {
            weatherPromise = fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,precipitation,pressure_msl,uv_index,cloud_cover&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,is_day,wind_speed_10m,wind_direction_10m&minutely_15=precipitation,weather_code&forecast_minutely_15=8&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,moonrise,moonset,moon_phase&timezone=auto&forecast_days=7&temperature_unit=celsius&wind_speed_unit=kmh`,
                { signal }
            ).then(response => {
                if (response.status === 429) {
                    registerOpenMeteoRateLimit(response);
                    if (hasUsableStaleWeather) {
                        usedStaleWeatherCache = true;
                        return null;
                    }
                }
                if (!response.ok) throw new Error(`Open-Meteo API HTTP ${response.status}`);
                return response.json();
            }).then(data => {
                if (data) {
                    weatherDataFromNetwork = true;
                    writeSessionApiCache(`weather-v1:${roundedLocation}`, data);
                    return data;
                }
                return cachedWeather.data;
            });
        }

        /* İsteğe bağlı hava kalitesi verisini ana tahminle paralel al. */
        const cachedAirQuality = readSessionApiCache(`air-quality-v1:${roundedLocation}`);
        const hasFreshAirQuality = Boolean(cachedAirQuality && Date.now() - cachedAirQuality.savedAt <= WEATHER_SESSION_CACHE_TTL_MS);
        const airQualityPromise = hasFreshAirQuality
            ? Promise.resolve(cachedAirQuality.data)
            : fetch(
                `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=european_aqi,pm2_5,pm10&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&forecast_days=4&timezone=auto`,
                { signal }
            ).then(response => response.ok ? response.json() : null).then(data => {
                if (data) writeSessionApiCache(`air-quality-v1:${roundedLocation}`, data);
                return data;
            }).catch(error => {
                if (error.name !== "AbortError") console.warn("Hava kalitesi alınamadı:", error);
                return null;
            });

        const data = await weatherPromise;
        if (requestId !== weatherDataRequestId) return;

        const current =
            data.current;

        if (!current) {
            throw new Error("Hava durumu yanıtında güncel veriler yok.");
        }

        const weatherDataStatus = document.getElementById("weatherDataStatus");
        if (weatherDataStatus) {
            weatherDataStatus.hidden = !usedStaleWeatherCache;
            weatherDataStatus.textContent = usedStaleWeatherCache
                ? `Open-Meteo limiti dolu; ${Math.max(1, Math.round(cachedWeatherAge / 60000))} dk önceki kayıt gösteriliyor.`
                : "";
        }
        if (weatherDataFromNetwork) {
            openMeteoCooldownUntil = 0;
            try { sessionStorage.removeItem("openMeteoCooldownUntil"); } catch {}
        }

        /* Bu ek veri ana ekranın çizilmesini bekletmesin. */
        void updateSeaTemperature(latitude, longitude);
        airQualityPromise.then(airData => {
            if (requestId !== weatherDataRequestId) return;
            if (airData?.current) {
                updateAirQuality(
                    airData.current.european_aqi,
                    airData.current.pm2_5,
                    airData.current.pm10
                );
            } else {
                updateAirQuality(null, null, null);
            }
            renderPollenForecast(airData?.hourly, current.time);
            updateLifestyleGuide(current, data.daily, data.hourly, airData);
            updateWeatherAlerts(current, data.daily, data.hourly, airData);
        });

        lastWeatherLocation = {
            latitude,
            longitude,
            cityName,
            country
        };
        updateCurrentFavoriteButton();

        currentTimezone =
            data.timezone || "auto";

        currentLatitude =
            latitude;

        currentLongitude =
            longitude;

        setText(
            "cityName",
            country
                ? `${cityName}, ${country}`
                : cityName
        );

        setText(
            "temperature",
            formatTemperature(current.temperature_2m)
        );

        setText(
            "description",
            getWeatherDescription(
                current.weather_code
            )
        );

        setText(
            "weatherIcon",
            getWeatherIcon(
                current.weather_code,
                current.is_day
            )
        );

        setText(
            "humidity",
            `${current.relative_humidity_2m}%`
        );

        setText(
            "wind",
            formatWindSpeed(current.wind_speed_10m)
        );

        setText(
            "feelsLike",
            formatTemperature(current.apparent_temperature)
        );

        setText(
            "elevation",
            `${Math.round(data.elevation)} m`
        );

        setText(
            "rainAmount",
            `${formatMillimeters(current.precipitation || 0)} mm`
        );

        setText(
            "todayRainAmount",
            `${formatMillimeters(
                data.daily.precipitation_sum[0] || 0
            )} mm`
        );

        updateWindCompass(
            current.wind_speed_10m,
            current.wind_direction_10m
        );

        updateUV(
            current.uv_index
        );

        updatePressure(
            current.pressure_msl
        );

        createTemperatureChart(
            data.hourly,
            current.time
        );

        createHourlyForecast(
            data.hourly,
            current.time
        );

        createForecast(
            data.daily
        );

        renderNearTermRain(data.minutely_15, current.time);

        updateLifestyleGuide(
            current,
            data.daily,
            data.hourly,
            null
        );

        updateWeatherAlerts(
            current,
            data.daily,
            data.hourly,
            null
        );

        sunriseTime =
            data.daily.sunrise[0];

        nextSunriseTime =
            data.daily.sunrise[1] || data.daily.sunrise[0];

        sunsetTime =
            data.daily.sunset[0];

        setText(
            "sunrise",
            getHourMinute(
                sunriseTime
            )
        );

        setText(
            "sunset",
            getHourMinute(
                sunsetTime
            )
        );

        updateDayNightVisual(
            current.is_day,
            data.daily.sunrise[0],
            data.daily.sunset[0],
            current.time
        );

        updateSunPosition();

        if (sunInterval) {
            clearInterval(
                sunInterval
            );
        }

        sunInterval =
            setInterval(
                updateSunPosition,
                1000
            );

        updateMoon(
            data.daily
        );

        if (clockInterval) {
            clearInterval(
                clockInterval
            );
        }

        updateLocalClock();

        clockInterval =
            setInterval(
                updateLocalClock,
                1000
            );

        document
            .getElementById("welcome")
            ?.classList.add("hidden");

        document
            .getElementById("weatherContent")
            ?.classList.remove("hidden");

        updateLocationMap(
            latitude,
            longitude,
            cityName,
            current.temperature_2m,
            null,
            current
        );

        /* is_day'i sunrise/sunset'e göre düzelt */
        const correctedIsDay = resolveIsDay(
            current.is_day,
            data.daily.sunrise[0],
            data.daily.sunset[0],
            current.time
        );

        createWeatherEffect(
            current.weather_code,
            correctedIsDay
        );

        updateAllNewWeatherFeatures(data, correctedIsDay);

    } catch (error) {

        if (error.name === "AbortError" || requestId !== weatherDataRequestId) return;

        console.error("❌ HAVA DURUMU HATASI:", error);
        console.error("Hata detayı:", {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        
        let reason = "Bilinmeyen hata.";
        
        if (error instanceof TypeError) {
            reason = "API'ye bağlanılamadı. İnternet bağlantını kontrol et.";
        } else if (error.message) {
            reason = error.message;
        }
        
        alert(`Hava durumu alınamadı.\n\n${reason}\n\nTarayıcı Console'unu (F12) kontrol et.`);
    }
}

/* =========================================================
   SESLİ HAVA BÜLTENİ
========================================================= */

/* Konuşma motoru state */
let voiceBulletinSpeaking = false;
let voiceBulletinUtterance = null;

/* Türkçe hava durumu metni oluştur */
function buildWeatherBulletinText() {
    const cityEl = document.getElementById("cityName");
    const tempEl = document.getElementById("temperature");
    const descEl = document.getElementById("description");
    const feelsEl = document.getElementById("feelsLike");
    const humEl = document.getElementById("humidity");
    const windEl = document.getElementById("wind");
    const sunriseEl = document.getElementById("sunrise");
    const sunsetEl = document.getElementById("sunset");

    const city = cityEl ? cityEl.textContent.trim() : "";
    const temp = tempEl ? tempEl.textContent.trim() : "";
    const desc = descEl ? descEl.textContent.trim() : "";
    const feels = feelsEl ? feelsEl.textContent.trim() : "";
    const hum = humEl ? humEl.textContent.trim() : "";
    const wind = windEl ? windEl.textContent.trim() : "";
    const sunriseVal = sunriseEl ? sunriseEl.textContent.trim() : "";
    const sunsetVal = sunsetEl ? sunsetEl.textContent.trim() : "";

    /* Zaman selamlama - sadece selamlama için kullanılıyor, tema yönetmiyor */
    const localTimeEl = document.getElementById("localTime");
    const localTimeText = localTimeEl ? localTimeEl.textContent.trim() : "";
    
    // Ekranda gösterilen yerel saatten saat bilgisini al
    let hour = 12; // varsayılan
    if (localTimeText && localTimeText.includes(":")) {
        const timeMatch = localTimeText.match(/(\d+):/);
        if (timeMatch) {
            hour = parseInt(timeMatch[1], 10);
        }
    }
    
    // Selamlama belirleme - sadece sesli bülten için
    let greeting = "Merhaba.";
    if (hour >= 5 && hour < 12) greeting = "Günaydın.";
    else if (hour >= 12 && hour < 18) greeting = "İyi günler.";
    else if (hour >= 18 && hour < 20) greeting = "İyi akşamlar.";
    else greeting = "İyi geceler.";

    let text = `${greeting} ${city} için hava durumu bülteni. `;

    if (temp && desc) {
        text += `Şu an dışarıda ${desc} hava var. Sıcaklık ${temp}. `;
    }

    if (feels && feels !== temp) {
        text += `Hissedilen sıcaklık ise ${feels}. `;
    }

    if (hum) {
        text += `Nem oranı yüzde ${hum.replace("%", "").trim()}. `;
    }

    if (wind) {
        text += `Rüzgâr hızı ${wind}. `;
    }

    /* Uyarı kartlarını oku */
    const alertContainer = document.getElementById("weatherAlertsContainer");
    if (alertContainer && !alertContainer.hidden) {
        const alertTitles = alertContainer.querySelectorAll(".alert-title");
        if (alertTitles.length > 0) {
            text += "Aktif meteorolojik uyarılar: ";
            alertTitles.forEach((el, i) => {
                text += (i > 0 ? ", " : "") + el.textContent.trim();
            });
            text += ". ";
        }
    }

    /* Giysi önerisi */
    const clothingEl = document.getElementById("clothingRecommendation");
    if (clothingEl) {
        const clothingText = clothingEl.textContent.trim();
        if (clothingText) {
            text += `Kıyafet önerisi: ${clothingText}. `;
        }
    }

    /* Güneş */
    if (sunriseVal && sunriseVal !== "--:--") {
        text += `Bugün güneş saat ${sunriseVal}'de doğdu`;
        if (sunsetVal && sunsetVal !== "--:--") {
            text += `, ${sunsetVal}'de batacak`;
        }
        text += ". ";
    }

    text += "Güzel günler dilerim.";
    return text;
}

/* Butonu dinle / durdur durumuna geçir */
function setVoiceBtnState(speaking) {
    const btn = document.getElementById("voiceBulletinBtn");
    if (!btn) return;
    voiceBulletinSpeaking = speaking;
    if (speaking) {
        btn.classList.add("speaking");
        btn.querySelector(".voice-btn-icon").textContent = "⏹";
        btn.querySelector(".voice-btn-text").textContent = "Durdur";
        btn.setAttribute("aria-label", "Sesi durdur");
        btn.title = "Sesi durdur";
    } else {
        btn.classList.remove("speaking");
        btn.querySelector(".voice-btn-icon").textContent = "🔊";
        btn.querySelector(".voice-btn-text").textContent = "Dinle";
        btn.setAttribute("aria-label", "Hava durumunu sesli dinle");
        btn.title = "Hava durumunu sesli dinle";
    }
}

/* Ana fonksiyon: dinle / durdur */
function speakWeatherBulletin() {
    const synth = window.speechSynthesis;
    if (!synth) return;

    /* Zaten konuşuyorsa durdur */
    if (voiceBulletinSpeaking) {
        synth.cancel();
        setVoiceBtnState(false);
        return;
    }

    /* Metni oluştur */
    const text = buildWeatherBulletinText();
    if (!text) return;

    /* Utterance yarat */
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "tr-TR";
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1;

    /* Türkçe ses ara — yoksa varsayılan kullan */
    const voices = synth.getVoices();
    const trVoice = voices.find(v =>
        v.lang === "tr-TR" || v.lang.startsWith("tr")
    );
    if (trVoice) utterance.voice = trVoice;

    utterance.onstart = () => setVoiceBtnState(true);
    utterance.onend = () => setVoiceBtnState(false);
    utterance.onerror = () => setVoiceBtnState(false);

    voiceBulletinUtterance = utterance;
    synth.speak(utterance);
}

/* Butonu DOM'a bağla ve Web Speech API desteği yoksa gizle */
function initVoiceBulletinButton() {
    const btn = document.getElementById("voiceBulletinBtn");
    if (!btn) return;

    if (!window.speechSynthesis) {
        /* Tarayıcı desteklemiyorsa butonu tamamen kaldır */
        btn.remove();
        return;
    }

    btn.hidden = false;
    btn.addEventListener("click", speakWeatherBulletin);
}

/* =========================================================
   AKILLI METEOROLOJİK UYARILAR
========================================================= */
function updateWeatherAlerts(current, daily, hourly, airData = null) {
    const container = document.getElementById("weatherAlertsContainer");
    if (!container) return;

    if (!current) {
        container.hidden = true;
        container.innerHTML = "";
        return;
    }

    const temp = Number(current.temperature_2m);
    const feelsLike = Number(Number.isFinite(Number(current.apparent_temperature)) ? current.apparent_temperature : temp);
    const windSpeed = Number(current.wind_speed_10m || 0);
    const uv = Number(current.uv_index || 0);
    const isDay = current.is_day === 1;
    const currentPrecip = Number(current.precipitation || 0);
    const weatherCode = Number(current.weather_code || 0);

    let next12MinTemp = temp;
    let next12MaxWind = windSpeed;
    let next12PrecipSum = currentPrecip;
    let next12RainProb = 0;

    if (hourly?.time) {
        const nowIndex = hourly.time.findIndex(t => t >= current.time);
        const start = nowIndex >= 0 ? nowIndex : 0;
        const sliceLen = 12;

        if (hourly.temperature_2m) {
            const tSlice = hourly.temperature_2m.slice(start, start + sliceLen).map(Number).filter(Number.isFinite);
            if (tSlice.length) next12MinTemp = Math.min(...tSlice);
        }
        if (hourly.wind_speed_10m) {
            const wSlice = hourly.wind_speed_10m.slice(start, start + sliceLen).map(Number).filter(Number.isFinite);
            if (wSlice.length) next12MaxWind = Math.max(...wSlice);
        }
        if (hourly.precipitation) {
            const pSlice = hourly.precipitation.slice(start, start + sliceLen).map(Number).filter(Number.isFinite);
            if (pSlice.length) next12PrecipSum = pSlice.reduce((a, b) => a + b, 0);
        }
        if (hourly.precipitation_probability) {
            const probSlice = hourly.precipitation_probability.slice(start, start + sliceLen).map(Number).filter(Number.isFinite);
            if (probSlice.length) next12RainProb = Math.max(...probSlice);
        }
    } else if (daily?.temperature_2m_min?.[0] !== undefined) {
        next12MinTemp = Number(daily.temperature_2m_min[0]) || temp;
        next12PrecipSum = Number(daily.precipitation_sum?.[0]) || 0;
        next12RainProb = Number(daily.precipitation_probability_max?.[0]) || 0;
    }

    const aqi = airData?.current?.european_aqi !== undefined && airData?.current?.european_aqi !== null
        ? Number(airData.current.european_aqi)
        : null;
    const pm25 = airData?.current?.pm2_5 !== undefined && airData?.current?.pm2_5 !== null
        ? Number(airData.current.pm2_5)
        : null;

    const alerts = [];

    // [1] Don ve Gizli Buzlanma Uyarısı
    if (feelsLike <= -3 || next12MinTemp <= -3) {
        alerts.push({
            severity: "danger",
            icon: "🚨",
            badge: "Şiddetli Don Tehlikesi",
            title: "Dondurucu Soğuk ve Şiddetli Don Uyarısı",
            description: `Hissedilen sıcaklık ${Math.round(feelsLike)}°C seviyesine indi. Yollarda şiddetli don, gizli buzlanma ve donma tehlikesine karşı azami dikkat gösterin.`,
            timeHint: "Önümüzdeki saatler boyunca etkili"
        });
    } else if (feelsLike <= 0 || next12MinTemp <= 0) {
        alerts.push({
            severity: "warning",
            icon: "⚠️",
            badge: "Don ve Buzlanma Riski",
            title: "Gizli Buzlanma ve Zirai Don Uyarısı",
            description: `Sıcaklık 0°C veya altına iniyor. Özellikle viyadük, köprü ve gölgelik alanlarda gizli buzlanmaya karşı dikkatli olun.`,
            timeHint: "Gece ve sabah saatlerinde kritik"
        });
    }

    // [2] Fırtına ve Şiddetli Rüzgâr Uyarısı
    if (windSpeed >= 50 || next12MaxWind >= 55) {
        alerts.push({
            severity: "danger",
            icon: "🌪️",
            badge: "Kuvvetli Fırtına",
            title: "Şiddetli Fırtına ve Yıkıcı Rüzgâr Uyarısı",
            description: `Rüzgâr hızı saatte ${Math.round(Math.max(windSpeed, next12MaxWind))} km'ye ulaşıyor. Çatı uçması, ağaç ve tabela devrilmesi gibi risklere karşı tedbirli olun.`,
            timeHint: "Anlık ve yakın saatlerde etkili"
        });
    } else if (windSpeed >= 38 || next12MaxWind >= 42) {
        alerts.push({
            severity: "warning",
            icon: "💨",
            badge: "Sert Rüzgâr",
            title: "Kuvvetli Rüzgâr ve Sert Esinti",
            description: `Rüzgâr hızı saatte ${Math.round(Math.max(windSpeed, next12MaxWind))} km seviyesinde esiyor. Balkon ve dış mekanlardaki hafif eşyaları sabitleyin.`,
            timeHint: "Gün boyu devam edebilir"
        });
    }

    // [3] Şimşek, Şiddetli Sağanak ve Sel Tehlikesi
    const isThunderstorm = [95, 96, 99].includes(weatherCode);
    const isHeavyRain = [65, 67, 81, 82].includes(weatherCode);

    if (isThunderstorm || currentPrecip >= 4 || next12PrecipSum >= 20) {
        alerts.push({
            severity: "danger",
            icon: "⛈️",
            badge: "Gök Gürültülü Sağanak ve Sel",
            title: "Kuvvetli Gök Gürültülü Fırtına ve Su Baskını Tehlikesi",
            description: `Bölgede şiddetli sağanak yağış ve yoğun şimşek aktivitesi tespit edildi. Ani sel, su baskını ve yıldırım riskine karşı kapalı ve güvenli alanlarda kalın.`,
            timeHint: "Kısa sürede yüksek yağış bırakabilir"
        });
    } else if (isHeavyRain || currentPrecip >= 2 || next12PrecipSum >= 10 || next12RainProb >= 75) {
        alerts.push({
            severity: "warning",
            icon: "🌧️",
            badge: "Kuvvetli Sağanak",
            title: "Etkili Sağanak Yağış Uyarısı",
            description: `Kuvvetli yağış nedeniyle yollarda su birikintileri ve görüş mesafesinde belirgin azalma yaşanabilir. Ulaşımda dikkatli ve tedbirli olun.`,
            timeHint: "Önümüzdeki saatlerde yağış bekleniyor"
        });
    }

    // [4] Kar Yağışı ve Tipi Uyarısı
    const isSnow = [71, 73, 75, 77, 85, 86].includes(weatherCode);
    const isHeavySnow = [75, 86].includes(weatherCode);

    if (isHeavySnow || (isSnow && windSpeed >= 30)) {
        alerts.push({
            severity: "danger",
            icon: "❄️",
            badge: "Yoğun Kar ve Tipi",
            title: "Yoğun Kar Yağışı ve Tipi Uyarısı",
            description: `Kuvvetli kar yağışı ve rüzgâr nedeniyle tipi, yollarda kapanma ve şiddetli buzlanma riski bulunmaktadır. Zorunlu olmadıkça trafiğe çıkmayın.`,
            timeHint: "Kuvvetli kar örtüsü riski"
        });
    } else if (isSnow) {
        alerts.push({
            severity: "warning",
            icon: "🌨️",
            badge: "Kar Yağışı",
            title: "Kar Yağışı ve Zemin Kayganlığı",
            description: `Bölgede kar yağışı etkili oluyor. Araçlarda kış lastiği kullanımına ve kaygan zeminlere dikkat edilmelidir.`,
            timeHint: "Zemin tutma ihtimali yüksek"
        });
    }

    // [5] Aşırı Sıcaklık Dalgası
    if (feelsLike >= 38 || temp >= 38) {
        alerts.push({
            severity: "danger",
            icon: "🔥",
            badge: "Aşırı Sıcak Dalgası",
            title: "Tehlikeli Sıcaklık ve Sıcak Çarpması Uyarısı",
            description: `Hissedilen sıcaklık ${Math.round(feelsLike)}°C seviyesinde! Yaşlılar, çocuklar ve kronik rahatsızlığı bulunanlar doğrudan güneşe çıkmamalı ve bol sıvı tüketmelidir.`,
            timeHint: "11:00 - 16:00 saatlerinde tehlike seviyesinde"
        });
    } else if (feelsLike >= 34 || temp >= 34) {
        alerts.push({
            severity: "warning",
            icon: "🌡️",
            badge: "Yüksek Sıcaklık",
            title: "Bunaltıcı ve Yüksek Sıcaklık Uyarısı",
            description: `Hissedilen sıcaklık ${Math.round(feelsLike)}°C seviyesine ulaşıyor. Güneş altında aşırı efor sarf etmekten kaçının.`,
            timeHint: "Öğle ve ikindi saatlerinde etkili"
        });
    }

    // [6] Aşırı UV Radyasyonu
    if (uv >= 8 && isDay) {
        alerts.push({
            severity: "danger",
            icon: "☀️",
            badge: "Çok Yüksek UV",
            title: "Tehlikeli Morötesi (UV) Işınımı Uyarısı",
            description: `UV endeksi ${uv.toFixed(1)} seviyesinde. Ciltte hızlı yanık ve göz hasarı riski vardır; şapka, güneş gözlüğü ve yüksek koruyucu krem kullanın.`,
            timeHint: "Öğle güneşinde maksimum seviye"
        });
    } else if (uv >= 6 && isDay) {
        alerts.push({
            severity: "warning",
            icon: "☀️",
            badge: "Yüksek UV",
            title: "Yüksek UV Radyasyonu Uyarısı",
            description: `UV endeksi ${uv.toFixed(1)} değerinde. Açık havada uzun süre korumasız kalmamaya özen gösterin.`,
            timeHint: "Gölgede kalmaya dikkat edin"
        });
    }

    // [7] Hava Kirliliği Uyarısı
    if (aqi !== null && (aqi >= 80 || (pm25 !== null && pm25 >= 50))) {
        alerts.push({
            severity: "danger",
            icon: "🌫️",
            badge: "Sağlıksız Hava Kalitesi",
            title: "Hava Kirliliği ve Partikül Madde Uyarısı",
            description: `Hava kalitesi indeksi sağlıksız seviyede (PM2.5: ${Math.round(pm25 || 0)} µg/m³). Solunum yolu hastaları, yaşlılar ve çocuklar açık havada bulunmaktan kaçınmalıdır.`,
            timeHint: "Açık hava aktivitelerini sınırlandırın"
        });
    } else if (aqi !== null && (aqi >= 60 || (pm25 !== null && pm25 >= 35))) {
        alerts.push({
            severity: "warning",
            icon: "🌫️",
            badge: "Hassas Hava Kalitesi",
            title: "Hassas Gruplar İçin Hava Kirliliği Uyarısı",
            description: `Hava kalitesi hassas kişiler için riskli değerlere yaklaştı. Açık havada yoğun egzersiz yapmaktan kaçının.`,
            timeHint: "Hassas gruplar tedbirli olmalı"
        });
    }

    // [8] Yoğun Sis ve Görüş Kaybı
    if ([45, 48].includes(weatherCode)) {
        alerts.push({
            severity: "info",
            icon: "🌁",
            badge: "Yoğun Sis",
            title: "Yoğun Sis ve Düşük Görüş Mesafesi",
            description: `Bölgede etkili olan sis görüş mesafesini kısıtlamaktadır. Karayolunda sis farlarınızı açın ve takip mesafesini artırın.`,
            timeHint: "Görüş mesafesi belirgin azalabilir"
        });
    }

    if (!alerts.length) {
        container.hidden = true;
        container.innerHTML = "";
        return;
    }

    const severityWeight = { danger: 3, warning: 2, info: 1 };
    alerts.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0));

    container.hidden = false;
    container.innerHTML = alerts.map(alert => `
        <div class="weather-alert-card alert-${escapeHtml(alert.severity)}" role="alert">
            <div class="alert-icon-col">
                <span class="alert-main-icon">${alert.icon}</span>
                <span class="alert-pulse-dot"></span>
            </div>
            <div class="alert-body">
                <div class="alert-header-row">
                    <span class="alert-badge">${escapeHtml(alert.badge)}</span>
                    <strong class="alert-title">${escapeHtml(alert.title)}</strong>
                </div>
                <p class="alert-description">${escapeHtml(alert.description)}</p>
                <div class="alert-meta">
                    <span>📡 Canlı Meteorolojik Analiz</span>
                    <span>•</span>
                    <span>${escapeHtml(alert.timeHint)}</span>
                </div>
            </div>
        </div>
    `).join("");
}

/* =========================================================
   BUGÜN NE GİYSEM & YAŞAM REHBERİ
========================================================= */
function updateLifestyleGuide(current, daily, hourly, airData = null) {
    if (!current) return;

    const temp = Number(current.temperature_2m);
    const feelsLike = Number(Number.isFinite(Number(current.apparent_temperature)) ? current.apparent_temperature : temp);
    const windSpeed = Number(current.wind_speed_10m || 0);
    const humidity = Number(current.relative_humidity_2m || 50);
    const uv = Number(current.uv_index || 0);
    const isDay = current.is_day === 1;
    const currentPrecip = Number(current.precipitation || 0);

    // Önümüzdeki 12 saatlik yağış ve yağış olasılığı analizi
    let nextHoursRainProb = 0;
    let nextHoursPrecipSum = 0;
    if (hourly?.time && hourly?.precipitation_probability) {
        const nowIndex = hourly.time.findIndex(t => t >= current.time);
        const start = nowIndex >= 0 ? nowIndex : 0;
        const next12 = hourly.precipitation_probability.slice(start, start + 12);
        if (next12.length) {
            nextHoursRainProb = Math.max(...next12.map(val => Number(val) || 0));
        }
        if (hourly.precipitation) {
            const nextPrecip = hourly.precipitation.slice(start, start + 12);
            nextHoursPrecipSum = nextPrecip.reduce((acc, v) => acc + (Number(v) || 0), 0);
        }
    } else if (daily?.precipitation_probability_max?.[0] !== undefined) {
        nextHoursRainProb = Number(daily.precipitation_probability_max[0]) || 0;
        nextHoursPrecipSum = Number(daily.precipitation_sum?.[0]) || 0;
    }

    const aqi = airData?.current?.european_aqi !== undefined && airData?.current?.european_aqi !== null
        ? Number(airData.current.european_aqi)
        : null;
    const pm25 = airData?.current?.pm2_5 !== undefined && airData?.current?.pm2_5 !== null
        ? Number(airData.current.pm2_5)
        : null;

    // 1. Kıyafet ve Üst Giyim Seçimi
    let statusBadge = "🌤️ Ilıman & Sakin";
    let mainIcon = "👕";
    let mainAdvice = "";
    let detailAdvice = "";
    let topIcon = "👕";
    let topText = "";
    let bottomIcon = "👖";
    let bottomText = "";
    let rainIcon = "☀️";
    let rainText = "Gerekmez";
    let sunIcon = "☁️";
    let sunText = "Gerekmez";

    const roundedFeels = Math.round(feelsLike);

    if (feelsLike < 0) {
        statusBadge = "❄️ Dondurucu Soğuk";
        mainIcon = "🧤";
        mainAdvice = "Kalın kışlık mont, atkı, bere ve eldiven şart!";
        detailAdvice = `Hissedilen sıcaklık ${roundedFeels}°C. Kat kat giyinmeli ve termal içlik tercih etmelisin.`;
        topIcon = "🧥";
        topText = "Termal + Kalın Mont";
        bottomIcon = "🥾";
        bottomText = "Kışlık Bot & Kalın Pantolon";
    } else if (feelsLike < 9) {
        statusBadge = "🧣 Oldukça Soğuk";
        mainIcon = "🧥";
        mainAdvice = "Kalın mont veya kışlık kaban giymelisin.";
        detailAdvice = `Hissedilen sıcaklık ${roundedFeels}°C. Sabah ve akşam ayazına karşı hazırlıklı ol.`;
        topIcon = "🧥";
        topText = "Kalın Mont / Kaban";
        bottomIcon = "🥾";
        bottomText = "Bot & Kalın Çorap";
    } else if (feelsLike < 16) {
        statusBadge = "🍂 Serin & Esintili";
        mainIcon = "🧥";
        mainAdvice = "Mevsimlik ceket, trençkot veya hırka almalısın.";
        detailAdvice = `Hissedilen sıcaklık ${roundedFeels}°C. Gün içinde hava ılısa bile gölgede ve rüzgârda üşütebilir.`;
        topIcon = "👔";
        topText = "Ceket, Trençkot / Hırka";
        bottomIcon = "👟";
        bottomText = "Kot & Kapalı Ayakkabı";
    } else if (feelsLike < 23) {
        statusBadge = "🌤️ Ilıman & Çok Rahat";
        mainIcon = "👔";
        mainAdvice = "Hafif bir üst veya uzun kollu tişört ideal.";
        detailAdvice = `Hissedilen sıcaklık ${roundedFeels}°C. Açık havada vakit geçirmek için yılın en konforlu koşulları.`;
        topIcon = "👕";
        topText = "Tişört / İnce Gömlek";
        bottomIcon = "👟";
        bottomText = "Rahat Pantolon & Sneaker";
    } else if (feelsLike < 30) {
        statusBadge = "☀️ Sıcak & Güneşli";
        mainIcon = "👕";
        mainAdvice = "İnce, terletmeyen pamuklu kıyafetler seç.";
        detailAdvice = `Hissedilen sıcaklık ${roundedFeels}°C. Açık renkli, nefes alan giysiler gün boyu serin tutar.`;
        topIcon = "🎽";
        topText = "İnce Tişört / Polo Yaka";
        bottomIcon = "🩳";
        bottomText = "Şort / Keten Pantolon";
    } else {
        statusBadge = "🔥 Aşırı Sıcak & Bunaltıcı";
        mainIcon = "🩴";
        mainAdvice = "En ince yazlık kıyafetlerini giy, gölgede kal.";
        detailAdvice = `Hissedilen sıcaklık ${roundedFeels}°C! Bol bol su tüketmeli ve güneş altında uzun kalmamalısın.`;
        topIcon = "🎽";
        topText = "Hafif Keten / Bol Tişört";
        bottomIcon = "🩴";
        bottomText = "Şort & Terlik / Sandalet";
    }

    // Yağış Koruması
    if (currentPrecip > 0.5 || nextHoursRainProb >= 65 || nextHoursPrecipSum >= 1.5) {
        rainIcon = "☂️";
        rainText = "Şemsiyeni Mutlaka Al!";
        if (feelsLike < 20) {
            bottomIcon = "🥾";
            bottomText = "Su Geçirmez Ayakkabı";
        }
        detailAdvice += " Yağış bekleniyor; su geçirmez ayakkabı ve şemsiyeni unutma.";
    } else if (nextHoursRainProb >= 30 || nextHoursPrecipSum > 0.1) {
        rainIcon = "🌂";
        rainText = "Çantaya Şemsiye At";
        detailAdvice += " Yağmur ihtimali var, çantanda tedbiren şemsiye bulundur.";
    } else {
        rainIcon = "☀️";
        rainText = "Şemsiye Gerekmez";
    }

    // Güneş / Aksesuar
    if (uv >= 6 && isDay) {
        sunIcon = "🕶️";
        sunText = "Güneş Gözlüğü & Şapka";
        detailAdvice += " UV seviyesi yüksek; güneş gözlüğü tak ve koruyucu krem sür.";
    } else if (uv >= 3 && isDay) {
        sunIcon = "🕶️";
        sunText = "Güneş Gözlüğü Tak";
    } else if (windSpeed >= 35) {
        sunIcon = "💨";
        sunText = "Rüzgarlık / Kapüşon";
        detailAdvice += " Rüzgâr oldukça sert; kapüşonlu üst veya rüzgarlık iyi gelecektir.";
    } else if (feelsLike < 5) {
        sunIcon = "🧣";
        sunText = "Atkı & Bere Tak";
    } else {
        sunIcon = "☁️";
        sunText = "Ekstra Aksesuar Yok";
    }

    // 2. Aktivite Skorları (0-10)

    // [A] Koşu ve Açık Hava Sporu
    let runScore = 10;
    if (feelsLike < -2) runScore -= 6;
    else if (feelsLike < 5) runScore -= 4;
    else if (feelsLike < 10) runScore -= 1;
    else if (feelsLike > 32) runScore -= 6;
    else if (feelsLike > 26) runScore -= 3;

    if (currentPrecip > 0.2 || nextHoursRainProb > 65) runScore -= 5;
    else if (nextHoursRainProb > 35) runScore -= 2;

    if (windSpeed > 35) runScore -= 3;
    else if (windSpeed > 25) runScore -= 1;

    if (aqi !== null && aqi > 50) runScore -= 2;
    runScore = Math.max(1, Math.min(10, runScore));

    let runTip = "Koşu ve açık hava sporu için son derece elverişli.";
    if (runScore >= 8) runTip = "Mükemmel! Açık havada antrenman için ideal sıcaklık.";
    else if (runScore >= 5) runTip = "Koşulabilir; rüzgâra veya hafif serinliğe dikkat et.";
    else runTip = "Olumsuz hava; kapalı alan antrenmanları daha güvenli.";

    // [B] Araba Yıkama
    let carScore = 10;
    if (currentPrecip > 0 || nextHoursRainProb > 60 || nextHoursPrecipSum > 0.4) carScore = 2;
    else if (nextHoursRainProb >= 35) carScore = 4;
    else if (nextHoursRainProb >= 20) carScore = 7;
    else if (windSpeed > 35) carScore = 6;
    carScore = Math.max(1, Math.min(10, carScore));

    let carTip = "Önümüzdeki saatlerde yağış yok, arabanı pırıl pırıl yapabilirsin.";
    if (carScore >= 8) carTip = "Mükemmel zaman! Yakın zamanda yağış beklenmiyor.";
    else if (carScore >= 5) carTip = "Riskli; gün içinde hafif yağış veya rüzgâr tozu olabilir.";
    else carTip = "Yıkamayı ertele! Yakında yağmur bekleniyor, kirlenecektir.";

    // [C] Çamaşır Kurutma (Dışarıda)
    let laundryScore = 10;
    if (currentPrecip > 0.1 || nextHoursRainProb >= 50) laundryScore = 1;
    else if (nextHoursRainProb >= 25) laundryScore = 4;
    else {
        if (humidity > 80) laundryScore -= 4;
        else if (humidity > 65) laundryScore -= 2;
        if (windSpeed < 5) laundryScore -= 1;
        if (feelsLike < 5) laundryScore -= 3;
    }
    laundryScore = Math.max(1, Math.min(10, laundryScore));

    let laundryTip = "Dışarıda çamaşır kurutmak için rüzgâr ve nem dengesi ideal.";
    if (laundryScore >= 8) laundryTip = "Hızlı kurur! Rüzgâr ve nem dış mekan için çok uygun.";
    else if (laundryScore >= 5) laundryTip = "Kuruması biraz zaman alabilir, havanın nemine dikkat et.";
    else laundryTip = "Çamaşırları içeri as; dışarıda yağış veya aşırı nem var.";

    // [D] Ev Havalandırma
    let ventScore = 10;
    if (feelsLike < 0) ventScore = 4;
    else if (feelsLike < 8) ventScore = 6;
    else if (feelsLike > 34) ventScore = 5;

    if (windSpeed > 45) ventScore -= 3;
    if (aqi !== null && aqi > 50) ventScore -= 4;
    if (pm25 !== null && pm25 > 25) ventScore -= 2;
    ventScore = Math.max(1, Math.min(10, ventScore));

    let ventTip = "Temiz ve taze hava, odaları bol bol havalandırabilirsin.";
    if (ventScore >= 8) ventTip = "Evi baştan başa havalandırmak için harika bir hava.";
    else if (ventScore >= 5) ventTip = "Kısa süreli (5-10 dk) şok havalandırma önerilir.";
    else ventTip = "Dış hava çok soğuk veya kirli, pencereleri uzun süre açık tutma.";

    // UI Güncelleme
    setText("lifestyleStatusBadge", statusBadge);
    setText("clothingMainIcon", mainIcon);
    setText("clothingMainAdvice", mainAdvice);
    setText("clothingDetailAdvice", detailAdvice);

    setText("wearTopIcon", topIcon);
    setText("wearTopText", topText);
    setText("wearBottomIcon", bottomIcon);
    setText("wearBottomText", bottomText);
    setText("wearRainIcon", rainIcon);
    setText("wearRainText", rainText);
    setText("wearSunIcon", sunIcon);
    setText("wearSunText", sunText);

    const updateScoreItem = (scoreId, tipId, barId, score, tip) => {
        setText(scoreId, `${score}/10`);
        setText(tipId, tip);
        const bar = document.getElementById(barId);
        if (bar) {
            bar.style.width = `${score * 10}%`;
            bar.classList.remove("good", "moderate", "poor");
            if (score >= 8) bar.classList.add("good");
            else if (score >= 5) bar.classList.add("moderate");
            else bar.classList.add("poor");
        }
    };

    updateScoreItem("actRunningScore", "actRunningTip", "actRunningBar", runScore, runTip);
    updateScoreItem("actCarWashScore", "actCarWashTip", "actCarWashBar", carScore, carTip);
    updateScoreItem("actLaundryScore", "actLaundryTip", "actLaundryBar", laundryScore, laundryTip);
    updateScoreItem("actVentilationScore", "actVentilationTip", "actVentilationBar", ventScore, ventTip);
}

function renderNearTermRain(minutely, currentTime) {
    const summary = document.getElementById("minuteRainSummary");
    const timeline = document.getElementById("minuteRainTimeline");
    if (!summary || !timeline) return;

    if (!Array.isArray(minutely?.time) || !Array.isArray(minutely?.precipitation) || !minutely.time.length) {
        summary.textContent = "Yakın vadeli yağış tahmini şu anda alınamadı.";
        timeline.innerHTML = "";
        return;
    }

    const currentIndex = minutely.time.findIndex(time => time >= currentTime);
    const startIndex = currentIndex < 0 ? 0 : currentIndex;
    const times = minutely.time.slice(startIndex, startIndex + 8);
    const amounts = minutely.precipitation.slice(startIndex, startIndex + 8).map(value => Number.isFinite(Number(value)) ? Number(value) : 0);

    if (!times.length) {
        summary.textContent = "Yakın vadeli yağış tahmini şu anda alınamadı.";
        timeline.innerHTML = "";
        return;
    }

    const wetIndexes = amounts.map((amount, index) => amount > 0.05 ? index : -1).filter(index => index >= 0);
    if (!wetIndexes.length) {
        summary.textContent = "Önümüzdeki 2 saatlik tahminde belirgin yağış görünmüyor.";
    } else {
        const firstWet = wetIndexes[0];
        let lastWet = firstWet;
        while (lastWet + 1 < amounts.length && amounts[lastWet + 1] > 0.05) lastWet++;
        const onset = firstWet === 0 ? "Şu an yağış bekleniyor" : `Yaklaşık ${firstWet * 15} dakika sonra yağış başlayabilir`;
        const duration = (lastWet - firstWet + 1) * 15;
        const durationText = lastWet === amounts.length - 1 ? "tahmin aralığının sonuna kadar" : `yaklaşık ${duration} dakika`;
        summary.textContent = `${onset}; yağışın ${durationText} sürmesi bekleniyor.`;
    }

    const peak = Math.max(...amounts, 0.1);
    timeline.innerHTML = times.map((time, index) => {
        const amount = amounts[index];
        const height = Math.max(5, Math.round((amount / peak) * 36));
        const timeLabel = String(time).slice(11, 16) || "--:--";
        const wet = amount > 0.05;
        return `<div class="minute-rain-step${wet ? " is-wet" : ""}">
            <span class="minute-rain-time">${timeLabel}</span>
            <span class="minute-rain-bar-wrap"><i class="minute-rain-bar" style="height:${height}px"></i></span>
            <strong>${formatMillimeters(amount)} mm</strong>
            <small>${wet ? "Yağış" : "Kuru"}</small>
        </div>`;
    }).join("");
}

function setText(id, value) {

    const element =
        document.getElementById(id);

    if (element) {
        element.textContent =
            value;
    }
}

/* =========================================================
   UV
========================================================= */
function updateUV(uv) {

    const uvElement =
        document.getElementById(
            "uvIndex"
        );

    const description =
        document.getElementById(
            "uvDescription"
        );

    if (
        !uvElement ||
        !description
    ) {
        return;
    }

    if (
        uv === null ||
        uv === undefined ||
        !Number.isFinite(
            Number(uv)
        )
    ) {

        uvElement.textContent =
            "--";

        description.textContent =
            "Veri yok";

        return;
    }

    const value =
        Number(uv);

    uvElement.textContent =
        value.toFixed(1);

    if (value <= 2) {
        description.textContent =
            "Düşük";
    } else if (value <= 5) {
        description.textContent =
            "Orta";
    } else if (value <= 7) {
        description.textContent =
            "Yüksek";
    } else if (value <= 10) {
        description.textContent =
            "Çok yüksek";
    } else {
        description.textContent =
            "Aşırı yüksek";
    }
}

/* =========================================================
   BASINÇ
========================================================= */
function updatePressure(pressure) {

    const element =
        document.getElementById(
            "pressure"
        );

    if (!element) {
        return;
    }

    if (
        pressure === null ||
        pressure === undefined ||
        !Number.isFinite(
            Number(pressure)
        )
    ) {

        element.textContent =
            "--";

        return;
    }

    element.textContent =
        Math.round(
            Number(pressure)
        );
}

/* =========================================================
   HAVA KALİTESİ
========================================================= */
function renderPollenForecast(hourly, currentTime) {
    const availability = document.getElementById("pollenAvailability");
    const output = document.getElementById("pollenForecast");
    if (!availability || !output) return;

    const definitions = [
        ["alder_pollen", "Kızılağaç", "🌳"],
        ["birch_pollen", "Huş ağacı", "🌿"],
        ["grass_pollen", "Çimen", "🌾"],
        ["mugwort_pollen", "Pelin otu", "🍃"],
        ["olive_pollen", "Zeytin", "🫒"],
        ["ragweed_pollen", "Ambrosia", "🌱"]
    ];

    if (!Array.isArray(hourly?.time) || !hourly.time.length) {
        availability.textContent = "Bu konum için ücretsiz kaynakta polen verisi bulunmuyor.";
        output.innerHTML = "";
        return;
    }

    const matchingStart = hourly.time.findIndex(time => time >= currentTime);
    if (matchingStart < 0) {
        availability.textContent = "Bu konum veya tarih için ücretsiz kaynakta polen verisi bulunmuyor.";
        output.innerHTML = "";
        return;
    }
    const startIndex = matchingStart;
    const relevantTimes = hourly.time.slice(startIndex, startIndex + 96);
    const dates = [...new Set(relevantTimes.map(time => String(time).slice(0, 10)))].slice(0, 4);
    const dateLabels = dates.map(date => {
        const [year, month, day] = date.split("-").map(Number);
        const dateAtNoonUtc = new Date(Date.UTC(year, month - 1, day, 12));
        return new Intl.DateTimeFormat("tr-TR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(dateAtNoonUtc);
    });

    const cards = definitions.map(([key, label, icon]) => {
        const series = hourly[key];
        if (!Array.isArray(series)) return null;
        const dayValues = dates.map(date => {
            let maximum = null;
            for (let index = startIndex; index < hourly.time.length && String(hourly.time[index]).slice(0, 10) === date; index++) {
                const value = series[index];
                if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
                    maximum = maximum === null ? Number(value) : Math.max(maximum, Number(value));
                }
            }
            return maximum;
        });
        if (dayValues.every(value => value === null)) return null;
        return { key, label, icon, dayValues };
    }).filter(Boolean);

    if (!cards.length) {
        availability.textContent = "Bu konum veya tarih için ücretsiz kaynakta polen verisi bulunmuyor.";
        output.innerHTML = "";
        return;
    }

    availability.textContent = "Her gün için saatlik tahminlerin en yüksek değeri gösteriliyor.";
    output.innerHTML = cards.map(card => `
        <article class="pollen-card">
            <div class="pollen-card-title"><span>${card.icon}</span><strong>${card.label}</strong></div>
            <div class="pollen-days">${card.dayValues.map((value, index) => `
                <div class="pollen-day">
                    <span>${dateLabels[index] || "--"}</span>
                    <strong>${value === null ? "—" : Math.round(value)}</strong>
                </div>`).join("")}
            </div>
            <small class="pollen-unit">tahmini tane/m³</small>
        </article>`).join("");
}

function updateAirQuality(
    aqi,
    pm25,
    pm10
) {

    const aqiElement =
        document.getElementById(
            "airQuality"
        );

    const description =
        document.getElementById(
            "airQualityDescription"
        );

    const pm25Element =
        document.getElementById(
            "pm25"
        );

    const pm10Element =
        document.getElementById(
            "pm10"
        );

    if (
        !aqiElement ||
        !description ||
        !pm25Element ||
        !pm10Element
    ) {
        return;
    }

    if (
        aqi === null ||
        aqi === undefined ||
        !Number.isFinite(
            Number(aqi)
        )
    ) {

        aqiElement.textContent =
            "--";

        description.textContent =
            "Veri yok";

    } else {

        const value =
            Number(aqi);

        aqiElement.textContent =
            Math.round(value);

        if (value < 20) {
            description.textContent =
                "İyi";
        } else if (value < 40) {
            description.textContent =
                "Fena değil";
        } else if (value < 60) {
            description.textContent =
                "Orta";
        } else if (value < 80) {
            description.textContent =
                "Kötü";
        } else if (value <= 100) {
            description.textContent =
                "Çok kötü";
        } else {
            description.textContent =
                "Aşırı kötü";
        }
    }

    pm25Element.textContent =
        pm25 !== null &&
        pm25 !== undefined &&
        Number.isFinite(Number(pm25))
            ? Number(pm25).toFixed(1)
            : "--";

    pm10Element.textContent =
        pm10 !== null &&
        pm10 !== undefined &&
        Number.isFinite(Number(pm10))
            ? Number(pm10).toFixed(1)
            : "--";
}

/* =========================================================
   RÜZGÂR
========================================================= */
function updateWindCompass(
    speed,
    direction
) {

    const arrow =
        document.getElementById(
            "windArrow"
        );

    const directionElement =
        document.getElementById(
            "windDirection"
        );

    const degreesElement =
        document.getElementById(
            "windDegrees"
        );

    const speedElement =
        document.getElementById(
            "windSpeedLarge"
        );

    const descriptionElement =
        document.getElementById(
            "windDescription"
        );

    if (
        !arrow ||
        !directionElement ||
        !degreesElement ||
        !speedElement ||
        !descriptionElement
    ) {
        return;
    }

    if (
        direction === null ||
        direction === undefined ||
        !Number.isFinite(
            Number(direction)
        )
    ) {

        arrow.style.transform =
            "translate(-50%, -90%) rotate(0deg)";

        directionElement.textContent =
            "--";

        degreesElement.textContent =
            "--°";

        speedElement.textContent =
            "--";

        setText("windSpeedUnit", windSpeedUnit === "mph" ? "mil/sa" : "km/sa");

        descriptionElement.textContent =
            "Rüzgâr yönü bulunamadı.";

        return;
    }

    const degree =
        Number(direction);

    const directionName =
        getWindDirectionName(
            degree
        );

    arrow.style.transform =
        `translate(-50%, -90%) rotate(${degree}deg)`;

    directionElement.textContent =
        directionName;

    degreesElement.textContent =
        `${Math.round(degree)}°`;

    const numericSpeed = Number(speed);
    speedElement.textContent = Number.isFinite(numericSpeed)
        ? Math.round(windSpeedUnit === "mph" ? numericSpeed / 1.609344 : numericSpeed)
        : "--";
    setText("windSpeedUnit", windSpeedUnit === "mph" ? "mil/sa" : "km/sa");

    descriptionElement.textContent =
        `Rüzgâr ${directionName} yönünden esiyor.`;
}

function getWindDirectionName(
    degrees
) {

    const directions = [
        "K",
        "K-KD",
        "KD",
        "D-KD",
        "D",
        "D-GD",
        "GD",
        "G-GD",
        "G",
        "G-GB",
        "GB",
        "B-GB",
        "B",
        "B-KB",
        "KB",
        "K-KB"
    ];

    const normalized =
        (Number(degrees) + 360) % 360;

    const index =
        Math.round(
            normalized / 22.5
        ) % 16;

    return directions[index];
}

/* =========================================================
   SICAKLIK GRAFİĞİ
========================================================= */
function createTemperatureChart(
    hourly,
    currentTime
) {

    const container =
        document.getElementById(
            "temperatureChart"
        );

    if (!container) {
        return;
    }

    let startIndex =
        hourly.time.findIndex(
            time => time >= currentTime
        );

    if (startIndex < 0) {
        startIndex = 0;
    }

    const values = [];
    const times = [];

    for (
        let i = startIndex;
        i < Math.min(
            startIndex + 24,
            hourly.time.length
        );
        i++
    ) {

        values.push(
            Number(
                hourly.temperature_2m[i]
            )
        );

        times.push(
            getHourMinute(
                hourly.time[i]
            )
        );
    }

    if (values.length < 2) {

        container.innerHTML =
            "<p>Grafik için yeterli veri yok.</p>";

        return;
    }

    const width = 900;
    const height = 290;

    const left = 45;
    const right = 20;
    const top = 35;
    const bottom = 50;

    const chartWidth =
        width - left - right;

    const chartHeight =
        height - top - bottom;

    const minValue =
        Math.min(...values);

    const maxValue =
        Math.max(...values);

    const padding =
        Math.max(
            2,
            (maxValue - minValue) * 0.15
        );

    const minTemp =
        minValue - padding;

    const maxTemp =
        maxValue + padding;

    const range =
        maxTemp - minTemp || 1;

    const points =
        values.map(
            (value, index) => {

                const x =
                    left +
                    (
                        index /
                        (values.length - 1)
                    ) *
                    chartWidth;

                const y =
                    top +
                    chartHeight -
                    (
                        (value - minTemp) /
                        range
                    ) *
                    chartHeight;

                return {
                    x,
                    y,
                    value,
                    time: times[index]
                };
            }
        );

    const linePoints =
        points
            .map(
                point =>
                    `${point.x},${point.y}`
            )
            .join(" ");

    const firstPoint =
        points[0];

    const lastPoint =
        points[
            points.length - 1
        ];

    const fillPoints =
        `${firstPoint.x},${height - bottom} ` +
        `${linePoints} ` +
        `${lastPoint.x},${height - bottom}`;

    let svg =
        `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;

    for (let i = 0; i <= 4; i++) {

        const y =
            top +
            (i / 4) *
            chartHeight;

        const temperature =
            maxTemp -
            (i / 4) *
            range;

        svg += `
            <line
                x1="${left}"
                y1="${y}"
                x2="${width - right}"
                y2="${y}"
                class="temp-chart-grid"
            ></line>

            <text
                x="8"
                y="${y + 4}"
                class="temp-chart-text"
            >
                ${formatTemperature(temperature)}
            </text>
        `;
    }

    svg += `
        <polygon
            points="${fillPoints}"
            class="temp-chart-fill"
        ></polygon>

        <polyline
            points="${linePoints}"
            class="temp-chart-line"
        ></polyline>
    `;

    points.forEach(
        (point, index) => {

            const important =
                index === 0 ||
                index % 3 === 0;

            svg += `
                <circle
                    cx="${point.x}"
                    cy="${point.y}"
                    r="${important ? 5 : 3.5}"
                    class="temp-chart-point"
                ></circle>
            `;

            if (important) {

                svg += `
                    <text
                        x="${point.x}"
                        y="${point.y - 13}"
                        text-anchor="middle"
                        class="temp-chart-text"
                    >
                        ${formatTemperature(point.value)}
                    </text>

                    <text
                        x="${point.x}"
                        y="${height - 18}"
                        text-anchor="middle"
                        class="temp-chart-time"
                    >
                        ${point.time}
                    </text>
                `;
            }
        }
    );

    svg += "</svg>";

    container.innerHTML = svg;
}

/* =========================================================
   DENİZ SICAKLIĞI
========================================================= */
async function updateSeaTemperature(
    latitude,
    longitude
) {

    const box =
        document.getElementById(
            "sea-temperature"
        );

    if (!box) {
        return;
    }

    seaTemperatureController?.abort();
    const requestController = new AbortController();
    seaTemperatureController = requestController;
    const requestId = ++seaTemperatureRequestId;

    box.classList.add("hidden");

    try {

        const response =
            await fetch(
                `https://marine-api.open-meteo.com/v1/marine?latitude=${latitude}&longitude=${longitude}&hourly=sea_surface_temperature&forecast_hours=24&timezone=auto&cell_selection=sea`,
                { signal: requestController.signal }
            );

        if (requestId !== seaTemperatureRequestId) return;

        if (!response.ok) {
            return;
        }

        const data =
            await response.json();

        if (requestId !== seaTemperatureRequestId) return;

        const marineLatitude =
            Number(data.latitude);

        const marineLongitude =
            Number(data.longitude);

        const distance =
            calculateDistance(
                latitude,
                longitude,
                marineLatitude,
                marineLongitude
            );

        if (
            !Number.isFinite(distance) ||
            distance > 60
        ) {
            return;
        }

        const temperatures =
            data.hourly
                ?.sea_surface_temperature ||
            [];

        let selectedTemperature =
            null;

        for (
            const rawTemperature
            of temperatures
        ) {

            if (
                rawTemperature === null ||
                rawTemperature === undefined ||
                rawTemperature === ""
            ) {
                continue;
            }

            const value =
                Number(rawTemperature);

            if (
                Number.isFinite(value)
            ) {
                selectedTemperature =
                    value;

                break;
            }
        }

        if (
            selectedTemperature === null
        ) {
            return;
        }

        box.textContent =
            `🌊 Deniz ${formatTemperature(selectedTemperature)}`;

        box.classList.remove(
            "hidden"
        );

    } catch (error) {

        if (error.name === "AbortError") return;

        console.error(
            "Deniz sıcaklığı:",
            error
        );
    }
}

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371;

    const dLat =
        degreesToRadians(
            lat2 - lat1
        );

    const dLon =
        degreesToRadians(
            lon2 - lon1
        );

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(
            degreesToRadians(lat1)
        ) *
        Math.cos(
            degreesToRadians(lat2)
        ) *
        Math.sin(dLon / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}

function degreesToRadians(
    degrees
) {
    return degrees * Math.PI / 180;
}

function formatMillimeters(
    value
) {

    if (
        !Number.isFinite(
            Number(value)
        )
    ) {
        return "0";
    }

    const number =
        Number(value);

    return number === 0
        ? "0"
        : number.toFixed(1);
}

/* =========================================================
   SAAT
========================================================= */
function updateLocalClock() {

    const clock =
        document.getElementById(
            "localTime"
        );

    if (!clock) {
        return;
    }

    const now =
        new Date();

    try {

        clock.textContent =
            new Intl.DateTimeFormat(
                "tr-TR",
                {
                    timeZone:
                        currentTimezone,

                    hour:
                        "2-digit",

                    minute:
                        "2-digit",

                    second:
                        "2-digit"
                }
            ).format(now);

    } catch {

        clock.textContent =
            now.toLocaleTimeString(
                "tr-TR"
            );
    }
}

/* =========================================================
   7 GÜN
========================================================= */
function createForecast(
    daily
) {

    const forecast =
        document.getElementById(
            "forecast"
        );

    if (!forecast) {
        return;
    }

    forecast.innerHTML = "";

    for (
        let i = 0;
        i < 7;
        i++
    ) {

        const date =
            new Date(
                daily.time[i]
            );

        const dayName =
            date.toLocaleDateString(
                "tr-TR",
                {
                    weekday: "short"
                }
            );

        const card =
            document.createElement(
                "div"
            );

        card.className =
            "forecast-day";

        card.innerHTML = `
            <div class="day">
                ${i === 0 ? "Bugün" : dayName}
            </div>

            <div class="icon">
                ${getWeatherIcon(
                    daily.weather_code[i],
                    1
                )}
            </div>

            <div class="temp">
                ${formatTemperature(daily.temperature_2m_max[i])} /
                ${formatTemperature(daily.temperature_2m_min[i])}
            </div>

            <div class="rain">
                💧 ${
                    daily
                        .precipitation_probability_max[i]
                    ?? 0
                }%
            </div>

            <div class="rain-sum">
                🌧️ ${
                    formatMillimeters(
                        daily.precipitation_sum[i]
                    )
                } mm
            </div>
        `;

        forecast.appendChild(
            card
        );
    }
}

/* =========================================================
   24 SAAT
========================================================= */
function createHourlyForecast(
    hourly,
    currentTime
) {

    const container =
        document.getElementById(
            "hourlyForecast"
        );

    if (!container) {
        return;
    }

    container.innerHTML = "";

    let startIndex =
        hourly.time.findIndex(
            time =>
                time >= currentTime
        );

    if (startIndex < 0) {
        startIndex = 0;
    }

    for (
        let i = startIndex;
        i <
        Math.min(
            startIndex + 24,
            hourly.time.length
        );
        i++
    ) {

        const card =
            document.createElement(
                "div"
            );

        card.className =
            "hourly-card";

        const timeText =
            i === startIndex
                ? "Şimdi"
                : getHourMinute(
                    hourly.time[i]
                );

        const rainProbability =
            hourly
                .precipitation_probability[i]
            ?? 0;

        const rain =
            hourly
                .precipitation[i]
            ?? 0;

        const direction =
            hourly
                .wind_direction_10m
                ?. [i];

        const directionName =
            Number.isFinite(
                Number(direction)
            )
                ? getWindDirectionName(
                    direction
                )
                : "--";

        card.innerHTML = `
            <div class="hourly-time">
                ${timeText}
            </div>

            <div class="hourly-icon">
                ${getWeatherIcon(
                    hourly.weather_code[i],
                    hourly.is_day[i]
                )}
            </div>

            <div class="hourly-temp">
                ${formatTemperature(hourly.temperature_2m[i])}
            </div>

            <div class="hourly-feels">
                Hissedilen ${formatTemperature(hourly.apparent_temperature[i])}
            </div>

            <div class="hourly-rain-prob">
                💧 ${rainProbability}%
            </div>

            <div class="hourly-rain-amount">
                🌧️ ${
                    formatMillimeters(
                        rain
                    )
                } mm
            </div>

            <div class="hourly-wind">
                🌬️ ${formatWindSpeed(hourly.wind_speed_10m[i])}
            </div>

            <div class="hourly-wind-direction">
                🧭 ${directionName}
            </div>
        `;

        container.appendChild(
            card
        );
    }
}

/* =========================================================
   AY
========================================================= */
function updateMoon(
    daily
) {

    const icon =
        document.getElementById(
            "moonPhaseIcon"
        );

    const name =
        document.getElementById(
            "moonPhaseName"
        );

    const illumination =
        document.getElementById(
            "moonIllumination"
        );

    const moonrise =
        document.getElementById(
            "moonrise"
        );

    const moonset =
        document.getElementById(
            "moonset"
        );

    if (
        !icon ||
        !name ||
        !illumination ||
        !moonrise ||
        !moonset
    ) {
        return;
    }

    const phase =
        Number(
            daily.moon_phase?.[0]
        );

    if (
        !Number.isFinite(phase)
    ) {

        icon.textContent =
            "🌙";

        name.textContent =
            "Veri yok";

        illumination.textContent =
            "Aydınlık: --%";

        moonrise.textContent =
            "--:--";

        moonset.textContent =
            "--:--";

        return;
    }

    const phaseInfo =
        getMoonPhaseInfo(
            phase
        );

    icon.textContent =
        phaseInfo.icon;

    name.textContent =
        phaseInfo.name;

    illumination.textContent =
        `Aydınlık: ${
            calculateMoonIllumination(
                phase
            )
        }%`;

    moonrise.textContent =
        getHourMinute(
            daily.moonrise?.[0]
        );

    moonset.textContent =
        getHourMinute(
            daily.moonset?.[0]
        );
}

function getMoonPhaseInfo(
    phase
) {

    const value =
        (Number(phase) + 1) % 1;

    if (
        value < 0.03 ||
        value >= 0.97
    ) {
        return {
            name: "Yeni Ay",
            icon: "🌑"
        };
    }

    if (value < 0.22) {
        return {
            name: "Hilal",
            icon: "🌒"
        };
    }

    if (value < 0.28) {
        return {
            name: "İlk Dördün",
            icon: "🌓"
        };
    }

    if (value < 0.47) {
        return {
            name: "Şişkin Ay",
            icon: "🌔"
        };
    }

    if (value < 0.53) {
        return {
            name: "Dolunay",
            icon: "🌕"
        };
    }

    if (value < 0.72) {
        return {
            name: "Küçülen Şişkin Ay",
            icon: "🌖"
        };
    }

    if (value < 0.78) {
        return {
            name: "Son Dördün",
            icon: "🌗"
        };
    }

    return {
        name: "Küçülen Hilal",
        icon: "🌘"
    };
}

function calculateMoonIllumination(
    phase
) {

    const value =
        (Number(phase) + 1) % 1;

    const illumination =
        (
            1 -
            Math.cos(
                2 * Math.PI * value
            )
        ) / 2;

    return Math.round(
        illumination * 100
    );
}

/* =========================================================
   HAVA AÇIKLAMASI / İKON
========================================================= */
function getWeatherDescription(
    code
) {

    if (code === 0) {
        return "Açık";
    }

    if (code === 1) {
        return "Çoğunlukla açık";
    }

    if (code === 2) {
        return "Parçalı bulutlu";
    }

    if (code === 3) {
        return "Kapalı";
    }

    if ([45, 48].includes(code)) {
        return "Sisli";
    }

    if ([51, 53, 55].includes(code)) {
        return "Çisenti";
    }

    if ([56, 57].includes(code)) {
        return "Dondurucu çisenti";
    }

    if ([61, 63, 65].includes(code)) {
        return "Yağmurlu";
    }

    if ([66, 67].includes(code)) {
        return "Dondurucu yağmur";
    }

    if ([71, 73, 75, 77].includes(code)) {
        return "Karlı";
    }

    if ([80, 81, 82].includes(code)) {
        return "Sağanak";
    }

    if ([85, 86].includes(code)) {
        return "Kar sağanağı";
    }

    if ([95, 96, 99].includes(code)) {
        return "Gök gürültülü fırtına";
    }

    return "Bilinmiyor";
}

function getWeatherIcon(
    code,
    isDay
) {

    if (code === 0) {
        return isDay
            ? "☀️"
            : "🌙";
    }

    if (code === 1) {
        return isDay
            ? "🌤️"
            : "🌙";
    }

    if (code === 2) {
        return "⛅";
    }

    if (code === 3) {
        return "☁️";
    }

    if ([45, 48].includes(code)) {
        return "🌫️";
    }

    if (
        [51, 53, 55, 56, 57]
            .includes(code)
    ) {
        return "🌦️";
    }

    if (
        [61, 63, 65, 66, 67]
            .includes(code)
    ) {
        return "🌧️";
    }

    if (
        [71, 73, 75, 77, 85, 86]
            .includes(code)
    ) {
        return "❄️";
    }

    if (
        [80, 81, 82]
            .includes(code)
    ) {
        return "🌧️";
    }

    if (
        [95, 96, 99]
            .includes(code)
    ) {
        return "⛈️";
    }

    return "🌡️";
}

/* =========================================================
   GECE / GÜNDÜZ
========================================================= */
function updateDayNightVisual(
    isDay,
    sunriseISO,
    sunsetISO,
    currentTimeISO
) {
    /*
     * Open-Meteo'nun is_day alanı bulutlu/yağmurlu havalarda
     * gün doğumundan sonra bile 0 dönebilir. Daha güvenilir
     * yöntem: gündoğumu ve günbatımı ISO zamanlarıyla karşılaştır.
     * Zamanlar yoksa is_day'e geri dön.
     */
    let resolvedIsDay;

    if (sunriseISO && sunsetISO && currentTimeISO) {
        try {
            const now = new Date(currentTimeISO).getTime();
            const rise = new Date(sunriseISO).getTime();
            const set = new Date(sunsetISO).getTime();
            if (!isNaN(now) && !isNaN(rise) && !isNaN(set)) {
                resolvedIsDay = (now >= rise && now < set) ? 1 : 0;
            } else {
                resolvedIsDay = isDay;
            }
        } catch {
            resolvedIsDay = isDay;
        }
    } else {
        resolvedIsDay = isDay;
    }

    const backgroundSun =
        document.getElementById(
            "sun"
        );

    const backgroundMoon =
        document.getElementById(
            "moon"
        );

    if (resolvedIsDay === 1) {

        document.body.classList.remove(
            "night"
        );

        if (backgroundSun) {

            backgroundSun.style.display =
                "block";

            backgroundSun.style.visibility =
                "visible";
        }

        if (backgroundMoon) {

            backgroundMoon.style.display =
                "none";

            backgroundMoon.style.visibility =
                "hidden";
        }

    } else {

        document.body.classList.add(
            "night"
        );

        if (backgroundSun) {

            backgroundSun.style.display =
                "none";

            backgroundSun.style.visibility =
                "hidden";
        }

        if (backgroundMoon) {

            backgroundMoon.style.display =
                "block";

            backgroundMoon.style.visibility =
                "visible";
        }
    }
}

/* =========================================================
   GÜNEŞ
========================================================= */
function updateSunPosition() {

    const sun =
        document.getElementById(
            "movingSun"
        );

    const progress =
        document.getElementById(
            "sunProgress"
        );

    const message =
        document.getElementById(
            "sunMessage"
        );

    const status =
        document.getElementById(
            "sunStatus"
        );

    if (
        !sun ||
        !progress ||
        !sunriseTime ||
        !sunsetTime
    ) {
        return;
    }

        const now = new Date();
    let cityNow;

    try {
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone: currentTimezone,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        }).formatToParts(now);

        cityNow = {
            hour: Number(
                parts.find(
                    p => p.type === "hour"
                ).value
            ),

            minute: Number(
                parts.find(
                    p => p.type === "minute"
                ).value
            ),

            second: Number(
                parts.find(
                    p => p.type === "second"
                ).value
            )
        };

    } catch {
        cityNow = {
            hour: now.getHours(),
            minute: now.getMinutes(),
            second: now.getSeconds()
        };
    }

    const nowSeconds =
        cityNow.hour * 3600 +
        cityNow.minute * 60 +
        cityNow.second;

    const sunrise =
        getTimeSeconds(sunriseTime);

    const sunset =
        getTimeSeconds(sunsetTime);

    if (
        sunrise === null ||
        sunset === null
    ) {
        return;
    }

    /* Güneş doğmadan önce veya battıktan sonra */
    if (
        nowSeconds < sunrise ||
        nowSeconds >= sunset
    ) {

        sun.textContent = "🌙";

        sun.style.left = "50%";
        sun.style.bottom = "8%";

        progress.style.width = "0%";

        status.textContent =
            "Güneş şu anda ufkun altında.";

        if (nowSeconds < sunrise) {

            message.textContent =
                `🌅 Güneş ${
                    getHourMinute(
                        sunriseTime
                    )
                }'de doğacak.`;

        } else {

            message.textContent =
                `🌙 Güneş yarın ${
                    getHourMinute(
                        nextSunriseTime || sunriseTime
                    )
                }'de yeniden doğacak.`;
        }

        return;
    }

    /* Güneş gökyüzündeyse */
    sun.textContent = "☀️";

    const totalDay =
        sunset - sunrise;

    const elapsed =
        nowSeconds - sunrise;

    let percent =
        elapsed / totalDay;

    percent =
        Math.max(
            0,
            Math.min(
                1,
                percent
            )
        );

    const percentNumber =
        percent * 100;

    const left =
        5 +
        percentNumber * 0.90;

    const arc =
        Math.sin(
            percent * Math.PI
        );

    const bottom =
        15 +
        arc * 62;

    sun.style.left =
        `${left}%`;

    sun.style.bottom =
        `${bottom}%`;

    progress.style.width =
        `${percentNumber}%`;

    status.textContent =
        `Güneş şu anda gökyüzünde. Günün %${Math.round(percentNumber)}'si tamamlandı.`;

    if (percent < 0.15) {

        message.textContent =
            "🌅 Güneş yeni doğdu.";

    } else if (percent < 0.40) {

        message.textContent =
            "☀️ Güneş yükseliyor.";

    } else if (percent < 0.60) {

        message.textContent =
            "☀️ Güneş gökyüzünün yükseklerinde.";

    } else if (percent < 0.85) {

        message.textContent =
            "🌤️ Güneş batıya doğru ilerliyor.";

    } else {

        message.textContent =
            "🌇 Güneş batmak üzere.";
    }
}

function getTimeSeconds(time) {

    if (!time) {
        return null;
    }

    const match =
        time.match(
            /T(\d{2}):(\d{2})/
        );

    if (!match) {
        return null;
    }

    return (
        Number(match[1]) * 3600 +
        Number(match[2]) * 60
    );
}

function getHourMinute(time) {

    if (!time) {
        return "--:--";
    }

    const match =
        time.match(
            /T(\d{2}):(\d{2})/
        );

    return match
        ? `${match[1]}:${match[2]}`
        : "--:--";
}

/* =========================================================
   HARİTA
========================================================= */
function initializeMap() {

    if (weatherMap) {
        return;
    }

    const mapElement =
        document.getElementById(
            "map"
        );

    if (!mapElement) {

        console.error(
            "Harita elementi bulunamadı."
        );

        return;
    }

    if (typeof L === "undefined") {

        console.error(
            "Leaflet yüklenemedi."
        );

        return;
    }

    /* Normal harita */
    standardMapLayer =
        L.tileLayer(
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
            {
                minZoom: 3,
                maxZoom: 18,
                maxNativeZoom: 18,
                attribution:
                    "Tiles © Esri"
            }
        );

    /* Uydu haritası */
    satelliteMapLayer =
        L.tileLayer(
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            {
                minZoom: 3,
                maxZoom: 18,
                maxNativeZoom: 18,
                attribution:
                    "Tiles © Esri"
            }
        );

    /* EUMETSAT GeoColour katmanını iki kopyayla tamponlayıp kareleri kesintisiz değiştir. */
    const initialSatelliteTime = new Date(
        Math.floor((Date.now() - 30 * 60 * 1000) / WEATHER_SATELLITE_STEP_MS) * WEATHER_SATELLITE_STEP_MS
    ).toISOString();
    const satelliteWmsOptions = {
            layers: "mtg_fd:rgb_geocolour",
            styles: "",
            format: "image/png",
            transparent: true,
            version: "1.1.1",
            time: initialSatelliteTime,
            opacity: 0.9,
            minZoom: 3,
            maxZoom: 18,
            keepBuffer: 1,
            updateWhenIdle: true,
            updateWhenZooming: false,
            attribution: "GeoColour RGB © EUMETSAT / NASA"
        };
    const createWeatherSatelliteLayer = opacity => L.tileLayer.wms(
        "https://view.eumetsat.int/geoserver/wms",
        { ...satelliteWmsOptions, opacity, className: "weather-satellite-layer" }
    );
    const attachWeatherSatelliteLayerEvents = layer => {
        layer.on("tileload", () => {
            layer._weatherSatelliteLoadedTileCount = (layer._weatherSatelliteLoadedTileCount || 0) + 1;
            weatherSatelliteTileLoadCount += 1;
        });
        layer.on("tileerror", () => {
            layer._weatherSatelliteTileErrorCount = (layer._weatherSatelliteTileErrorCount || 0) + 1;
            weatherSatelliteTileErrorCount += 1;
            if (weatherSatelliteRetryTimer !== null) return;

            weatherSatelliteRetryTimer = window.setTimeout(() => {
                weatherSatelliteRetryTimer = null;
                if (!weatherSatelliteEnabled || weatherSatelliteTileLoadCount > 0) return;

                /* Oynatma sırasında başarısız kareyi geri sarmak yerine sıradaki kareye geç. */
                if (weatherSatellitePlaybackActive) {
                    setWeatherSatelliteStatus("Bu uydu karesi yüklenemedi; sonraki kare deneniyor…");
                    return;
                }

                if (weatherSatelliteFallbackAttempts < 6 && weatherSatelliteSelectedIndex > 0) {
                    weatherSatelliteFallbackAttempts += 1;
                    setWeatherSatelliteStatus("En yeni kare henüz hazır değil; daha eski uydu görüntüsü deneniyor…");
                    updateWeatherSatelliteFrame(weatherSatelliteSelectedIndex - 1);
                    return;
                }

                if (!weatherSatelliteTileErrorShown) {
                    weatherSatelliteTileErrorShown = true;
                    setWeatherSatelliteStatus(
                        "EUMETSAT uydu görüntüsü alınamadı. Bağlantıyı kontrol et veya başka bir saat seç."
                    );
                }
            }, 1800);
        });
    };
    weatherSatelliteLayer = createWeatherSatelliteLayer(0.9);
    weatherSatelliteBufferLayer = createWeatherSatelliteLayer(0);
    attachWeatherSatelliteLayerEvents(weatherSatelliteLayer);
    attachWeatherSatelliteLayerEvents(weatherSatelliteBufferLayer);

    weatherMap =
        L.map(
            mapElement,
            {
                center: [39, 35],
                zoom: 6,
                minZoom: 4,
                maxZoom: 18,
                zoomControl: true,
                layers: [
                    standardMapLayer
                ]
            }
        );

    L.control
        .scale({
            imperial: false
        })
        .addTo(weatherMap);

    cloudOverlayLayer = L.layerGroup();
    temperatureOverlayLayer = L.layerGroup();
    temperatureOverlayRenderer = L.canvas({ padding: 0.5 });
    precipitationForecastLayer = L.layerGroup();
    precipitationForecastRenderer = L.canvas({ padding: 0.5 });
    weatherMap.on("moveend", scheduleWeatherGridUpdate);

    currentMapStyle =
        "standard";

    setTimeout(() => {

        if (weatherMap) {
            weatherMap.invalidateSize(
                true
            );
        }

    }, 300);
}

function setWeatherSatelliteStatus(message) {
    const status = document.getElementById("weatherSatelliteStatus");
    if (status) status.textContent = message;
}

function formatWeatherSatelliteTime(date) {
    return new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Istanbul"
    }).format(date) + " TSİ";
}

function cancelWeatherSatelliteLayerFade() {
    if (weatherSatelliteFadeAnimationId) {
        window.cancelAnimationFrame(weatherSatelliteFadeAnimationId);
        weatherSatelliteFadeAnimationId = 0;
    }
}

function finishWeatherSatelliteLayerFade() {
    cancelWeatherSatelliteLayerFade();
    weatherSatelliteLayer?.setOpacity(0.9);
    weatherSatelliteBufferLayer?.setOpacity(0);
}

function crossfadeWeatherSatelliteLayers(nextLayer, previousLayer) {
    cancelWeatherSatelliteLayerFade();
    nextLayer.bringToFront();
    nextLayer.setOpacity(0);
    previousLayer.setOpacity(0.9);

    const startedAt = performance.now();
    const maximumOpacity = 0.9;
    const animate = now => {
        const progress = Math.min(1, (now - startedAt) / WEATHER_SATELLITE_CROSSFADE_MS);
        const incomingOpacity = maximumOpacity * progress;
        /* Sabit toplam opaklık, iki kare üst üste gelirken oluşan parlama/koyulaşmayı önler. */
        const outgoingOpacity = progress >= 1
            ? 0
            : (maximumOpacity - incomingOpacity) / (1 - incomingOpacity);

        nextLayer.setOpacity(incomingOpacity);
        previousLayer.setOpacity(outgoingOpacity);

        if (progress < 1) {
            weatherSatelliteFadeAnimationId = window.requestAnimationFrame(animate);
        } else {
            weatherSatelliteFadeAnimationId = 0;
        }
    };

    weatherSatelliteFadeAnimationId = window.requestAnimationFrame(animate);
}

function updateWeatherSatelliteFrame(index) {
    if (!weatherSatelliteLayer || !weatherSatelliteLatestTime) return;

    /* Elle başka kare seçilirse devam eden geçişi tamamlayıp sabit kareyi koru. */
    finishWeatherSatelliteLayerFade();

    /* Yeni kare iptal edilirse, ekranda kalan kareyi tam parlaklıkta tut. */
    weatherSatelliteLayer.setOpacity(0.9);

    weatherSatelliteSelectedIndex = Math.max(
        0,
        Math.min(WEATHER_SATELLITE_FRAME_COUNT, Math.round(index))
    );

    const slider = document.getElementById("weatherSatelliteTime");
    if (slider) slider.value = String(weatherSatelliteSelectedIndex);

    const frameTime = new Date(
        weatherSatelliteLatestTime.getTime() -
        (WEATHER_SATELLITE_FRAME_COUNT - weatherSatelliteSelectedIndex) * WEATHER_SATELLITE_STEP_MS
    );
    const timeToken = frameTime.toISOString();

    weatherSatelliteTileErrorShown = false;
    weatherSatelliteTileLoadCount = 0;
    weatherSatelliteTileErrorCount = 0;
    if (weatherSatelliteRetryTimer !== null) {
        window.clearTimeout(weatherSatelliteRetryTimer);
        weatherSatelliteRetryTimer = null;
    }
    setWeatherSatelliteStatus(
        `Görüntü zamanı: ${formatWeatherSatelliteTime(frameTime)} · veriler işlenme nedeniyle gecikebilir.`
    );

    const canPreload = weatherSatelliteEnabled &&
        weatherMap &&
        weatherMap.hasLayer(weatherSatelliteLayer) &&
        weatherSatelliteBufferLayer;

    if (!canPreload) {
        weatherSatelliteLayer.setParams({ time: timeToken }, false);
        weatherSatelliteLayer.redraw();
        return;
    }

    const requestId = ++weatherSatelliteFrameRequestId;
    const nextLayer = weatherSatelliteBufferLayer;
    if (weatherSatellitePendingLoadHandler) {
        nextLayer.off("load", weatherSatellitePendingLoadHandler);
        weatherSatellitePendingLoadHandler = null;
    }
    if (weatherSatellitePreloadTimeout !== null) {
        window.clearTimeout(weatherSatellitePreloadTimeout);
        weatherSatellitePreloadTimeout = null;
    }
    nextLayer.setOpacity(0);
    nextLayer.setParams({ time: timeToken }, false);
    nextLayer._weatherSatelliteLoadedTileCount = 0;
    nextLayer._weatherSatelliteTileErrorCount = 0;
    weatherSatelliteTileLoadCount = 0;
    weatherSatellitePendingLoadHandler = () => {
        nextLayer.off("load", weatherSatellitePendingLoadHandler);
        weatherSatellitePendingLoadHandler = null;
        if (weatherSatellitePreloadTimeout !== null) {
            window.clearTimeout(weatherSatellitePreloadTimeout);
            weatherSatellitePreloadTimeout = null;
        }

        if (requestId !== weatherSatelliteFrameRequestId || !weatherSatelliteEnabled) {
            nextLayer.setOpacity(0);
            return;
        }

        /* Başarısız bir yeni kare gelirse eski görüntüyü ekranda tut. */
        if (
            nextLayer._weatherSatelliteLoadedTileCount === 0 ||
            nextLayer._weatherSatelliteTileErrorCount > 0
        ) {
            nextLayer.setOpacity(0);
            setWeatherSatelliteStatus("Kare eksik yüklendi; önceki görüntü korunuyor.");
            if (weatherSatellitePlaybackActive) scheduleWeatherSatellitePlaybackFrame(WEATHER_SATELLITE_PLAYBACK_PAUSE_MS);
            return;
        }

        const previousLayer = weatherSatelliteLayer;
        weatherSatelliteLayer = nextLayer;
        weatherSatelliteBufferLayer = previousLayer;
        crossfadeWeatherSatelliteLayers(weatherSatelliteLayer, previousLayer);
        if (weatherSatellitePlaybackActive) scheduleWeatherSatellitePlaybackFrame(WEATHER_SATELLITE_PLAYBACK_PAUSE_MS);
    };
    nextLayer.once("load", weatherSatellitePendingLoadHandler);
    if (!weatherMap.hasLayer(nextLayer)) nextLayer.addTo(weatherMap);
    weatherSatellitePreloadTimeout = window.setTimeout(() => {
        weatherSatellitePreloadTimeout = null;
        if (requestId !== weatherSatelliteFrameRequestId) return;
        if (weatherSatellitePendingLoadHandler) {
            nextLayer.off("load", weatherSatellitePendingLoadHandler);
            weatherSatellitePendingLoadHandler = null;
        }
        nextLayer.setOpacity(0);
        setWeatherSatelliteStatus(
            weatherSatellitePlaybackActive
                ? "Bu kare gecikti; animasyon sonraki görüntüyle devam ediyor…"
                : "Yeni kare yüklenemedi; önceki görüntü ekranda tutuluyor."
        );
        if (weatherSatellitePlaybackActive) scheduleWeatherSatellitePlaybackFrame(WEATHER_SATELLITE_PLAYBACK_PAUSE_MS);
    }, 6000);
}

function toggleWeatherSatellite() {
    initializeMap();
    if (!weatherMap || !weatherSatelliteLayer) return;

    const button = document.getElementById("weatherSatelliteButton");
    const timeline = document.getElementById("weatherSatelliteTimeline");

    weatherSatelliteEnabled = !weatherSatelliteEnabled;
    if (weatherSatelliteEnabled) {
        /* İşlenme gecikmesi için son görüntü isteğini 30 dakika geriden başlat. */
        const nowWithDelay = Date.now() - 30 * 60 * 1000;
        weatherSatelliteLatestTime = new Date(
            Math.floor(nowWithDelay / WEATHER_SATELLITE_STEP_MS) * WEATHER_SATELLITE_STEP_MS
        );
        weatherSatelliteTileErrorShown = false;
        weatherSatelliteFallbackAttempts = 0;
        updateWeatherSatelliteFrame(WEATHER_SATELLITE_FRAME_COUNT);
        weatherMap.addLayer(weatherSatelliteLayer);
        if (timeline) timeline.hidden = false;
        button?.classList.add("active");
        button?.setAttribute("aria-pressed", "true");
    } else {
        stopWeatherSatellitePlayback();
        finishWeatherSatelliteLayerFade();
        if (weatherSatellitePreloadTimeout !== null) {
            window.clearTimeout(weatherSatellitePreloadTimeout);
            weatherSatellitePreloadTimeout = null;
        }
        weatherSatelliteFrameRequestId += 1;
        if (weatherSatellitePendingLoadHandler && weatherSatelliteBufferLayer) {
            weatherSatelliteBufferLayer.off("load", weatherSatellitePendingLoadHandler);
            weatherSatellitePendingLoadHandler = null;
        }
        if (weatherMap.hasLayer(weatherSatelliteLayer)) weatherMap.removeLayer(weatherSatelliteLayer);
        if (weatherSatelliteBufferLayer && weatherMap.hasLayer(weatherSatelliteBufferLayer)) {
            weatherMap.removeLayer(weatherSatelliteBufferLayer);
        }
        weatherSatelliteLayer?.setOpacity(0.9);
        weatherSatelliteBufferLayer?.setOpacity(0);
        if (timeline) timeline.hidden = true;
        button?.classList.remove("active");
        button?.setAttribute("aria-pressed", "false");
    }
}

function stepWeatherSatellite(direction) {
    if (!weatherSatelliteEnabled) return;
    stopWeatherSatellitePlayback();
    updateWeatherSatelliteFrame(weatherSatelliteSelectedIndex + direction);
}

function goToLatestWeatherSatellite() {
    if (!weatherSatelliteEnabled) return;
    stopWeatherSatellitePlayback();
    updateWeatherSatelliteFrame(WEATHER_SATELLITE_FRAME_COUNT);
}

function stopWeatherSatellitePlayback() {
    weatherSatellitePlaybackActive = false;
    if (weatherSatellitePlaybackTimer !== null) {
        window.clearTimeout(weatherSatellitePlaybackTimer);
        weatherSatellitePlaybackTimer = null;
    }
    const button = document.getElementById("weatherSatellitePlay");
    if (button) {
        button.textContent = "▶ Oynat";
        button.setAttribute("aria-pressed", "false");
    }
}

function scheduleWeatherSatellitePlaybackFrame(delay = WEATHER_SATELLITE_PLAYBACK_PAUSE_MS) {
    if (!weatherSatellitePlaybackActive || weatherSatellitePlaybackTimer !== null) return;
    weatherSatellitePlaybackTimer = window.setTimeout(() => {
        weatherSatellitePlaybackTimer = null;

        if (!weatherSatellitePlaybackActive || !weatherSatelliteEnabled) return;
        if (weatherSatelliteSelectedIndex >= WEATHER_SATELLITE_FRAME_COUNT) {
            stopWeatherSatellitePlayback();
            return;
        }

        updateWeatherSatelliteFrame(weatherSatelliteSelectedIndex + 1);
    }, delay);
}

function toggleWeatherSatellitePlayback() {
    if (!weatherSatelliteEnabled) return;
    if (weatherSatellitePlaybackActive) {
        stopWeatherSatellitePlayback();
        return;
    }

    weatherSatellitePlaybackActive = true;
    if (weatherSatelliteSelectedIndex >= WEATHER_SATELLITE_FRAME_COUNT) {
        updateWeatherSatelliteFrame(0);
    } else if (!weatherSatellitePendingLoadHandler) {
        scheduleWeatherSatellitePlaybackFrame();
    }
    const button = document.getElementById("weatherSatellitePlay");
    if (button) {
        button.textContent = "❚❚ Duraklat";
        button.setAttribute("aria-pressed", "true");
    }
}

function attachMapClickHandler() {
    initializeMap();

    if (!weatherMap || weatherMap._weatherClickHandlerAttached) return;

    weatherMap.on("click", async event => {
        const latitude = Number(event.latlng.lat);
        const longitude = Number(event.latlng.lng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        currentLatitude = latitude;
        currentLongitude = longitude;
        currentTimezone = "auto";

        let pointName = `Harita noktası (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`;
        try {
            const place = await reverseGeocode(latitude, longitude);
            pointName = place.city || place.province || pointName;
        } catch (error) {
            console.warn("Harita noktası adı alınamadı:", error);
        }

        await showWeather(latitude, longitude, pointName, "");
    });

    weatherMap._weatherClickHandlerAttached = true;
}
/* =========================================================
   MEVCUT KONUMU HARİTADA GÖSTER
========================================================= */
function updateLocationMap(
    latitude,
    longitude,
    cityName = "Konum",
    temperature = null,
    accuracy = null,
    weatherDetails = null
) {

    initializeMap();

    if (!weatherMap) {
        return;
    }

    /* Eski ana markerı kaldır */
    if (weatherMarker) {

        weatherMap.removeLayer(
            weatherMarker
        );

        weatherMarker = null;
    }

    /* Eski hassasiyet alanını kaldır */
    if (accuracyCircle) {

        weatherMap.removeLayer(
            accuracyCircle
        );

        accuracyCircle = null;
    }

    const markerIcon =
        L.divIcon({
            className:
                "weather-map-marker",

            html: `
                <div class="map-marker-inner">
                    <span>📍</span>
                </div>
            `,

            iconSize: [
                44,
                44
            ],

            iconAnchor: [
                22,
                44
            ]
        });

    weatherMarker =
        L.marker(
            [
                latitude,
                longitude
            ],
            {
                icon:
                    markerIcon
            }
        ).addTo(
            weatherMap
        );

    const safeCity =
        escapeHtml(
            cityName ||
            "Konum"
        );

    const temperatureText =
        temperature !== null &&
        temperature !== undefined
            ? formatTemperature(temperature)
            : document
                .getElementById(
                    "temperature"
                )
                ?.textContent ||
              "--";

    const display = value => Number.isFinite(Number(value)) ? Math.round(Number(value)) : "--";
    const detailRows = weatherDetails ? [
        ["🌤️", getWeatherDescription(weatherDetails.weather_code)],
        ["🤔", `Hissedilen ${formatTemperature(weatherDetails.apparent_temperature)}`],
        ["💧", `Nem ${display(weatherDetails.relative_humidity_2m)}%`],
        ["💨", `Rüzgâr ${formatWindSpeed(weatherDetails.wind_speed_10m)} · ${display(weatherDetails.wind_direction_10m)}°`],
        ["🌧️", `Yağış ${formatMillimeters(weatherDetails.precipitation || 0)} mm`],
        ["☁️", `Bulut ${display(weatherDetails.cloud_cover)}%`],
        ["🌡️", `Basınç ${display(weatherDetails.pressure_msl)} hPa`],
        ["🔆", `UV ${Number.isFinite(Number(weatherDetails.uv_index)) ? Number(weatherDetails.uv_index).toFixed(1) : "--"}`]
    ].map(([icon, label]) => `<div class="map-popup-item"><span>${icon}</span><span>${escapeHtml(label)}</span></div>`).join("") : "";

    weatherMarker.bindPopup(`
        <div class="map-popup">

            <strong>
                ${safeCity}
            </strong>

            <div class="map-popup-temperature">🌡️ ${escapeHtml(temperatureText)}</div>

            ${detailRows ? `<div class="map-popup-details">${detailRows}</div>` : ""}

            <div>
                📍 ${latitude.toFixed(5)},
                ${longitude.toFixed(5)}
            </div>

            ${
                accuracy
                    ? `
                        <div>
                            🎯 Hassasiyet:
                            ${Math.round(
                                accuracy
                            )} m
                        </div>
                    `
                    : ""
            }

        </div>
    `);

    /* Konum hassasiyet çemberi */
    if (
        accuracy &&
        Number.isFinite(
            Number(accuracy)
        )
    ) {

        accuracyCircle =
            L.circle(
                [
                    latitude,
                    longitude
                ],
                {
                    radius:
                        accuracy,

                    className:
                        "location-accuracy-circle"
                }
            ).addTo(
                weatherMap
            );
    }

    const mapInfo =
        document.getElementById(
            "mapInfo"
        );

    if (mapInfo) {

        mapInfo.textContent =
            `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }

    setTimeout(() => {

        if (!weatherMap) {
            return;
        }

        weatherMap.invalidateSize(
            true
        );

        weatherMap.setView(
            [
                latitude,
                longitude
            ],
            11
        );

    }, 300);

    setTimeout(() => {

        if (
            weatherMarker &&
            weatherMap
        ) {
            weatherMarker.openPopup();
        }

    }, 700);
}

/* =========================================================
   HARİTA TÜRÜ
========================================================= */
function setMapStyle(style) {

    initializeMap();

    if (!weatherMap) {
        return;
    }

    const standardButton =
        document.getElementById(
            "mapStandardButton"
        );

    const satelliteButton =
        document.getElementById(
            "mapSatelliteButton"
        );

    if (style === "satellite") {

        if (
            weatherMap.hasLayer(
                standardMapLayer
            )
        ) {
            weatherMap.removeLayer(
                standardMapLayer
            );
        }

        if (
            !weatherMap.hasLayer(
                satelliteMapLayer
            )
        ) {
            weatherMap.addLayer(
                satelliteMapLayer
            );
        }

        currentMapStyle =
            "satellite";

        standardButton?.classList.remove(
            "active"
        );

        satelliteButton?.classList.add(
            "active"
        );

    } else {

        if (
            weatherMap.hasLayer(
                satelliteMapLayer
            )
        ) {
            weatherMap.removeLayer(
                satelliteMapLayer
            );
        }

        if (
            !weatherMap.hasLayer(
                standardMapLayer
            )
        ) {
            weatherMap.addLayer(
                standardMapLayer
            );
        }

        currentMapStyle =
            "standard";

        satelliteButton?.classList.remove(
            "active"
        );

        standardButton?.classList.add(
            "active"
        );
    }

    setTimeout(() => {

        weatherMap?.invalidateSize(
            true
        );

    }, 200);
}

/* =========================================================
   HARİTA HAVA KATMANLARI
========================================================= */
function initializeWeatherMapLayers() {
    const rainForecastButton = document.getElementById("rainLayerButton");
    const cloudButton = document.getElementById("cloudLayerButton");
    const temperatureButton = document.getElementById("temperatureLayerButton");
    const playButton = document.getElementById("radarPlayButton");
    const frameSlider = document.getElementById("radarFrameSlider");
    const radarButton = document.getElementById("radarLayerButton");
    const forecastSlider = document.getElementById("weatherForecastSlider");
    const forecastPlayButton = document.getElementById("weatherForecastPlayButton");
    const satelliteTimeSlider = document.getElementById("weatherSatelliteTime");
    const satelliteButton = document.getElementById("weatherSatelliteButton");
    const satellitePreviousButton = document.getElementById("weatherSatellitePrev");
    const satelliteNextButton = document.getElementById("weatherSatelliteNext");
    const satelliteLatestButton = document.getElementById("weatherSatelliteLatest");
    const satellitePlayButton = document.getElementById("weatherSatellitePlay");

    radarButton?.addEventListener("click", () => toggleWeatherMapLayer("radar"));
    rainForecastButton?.addEventListener("click", () => toggleWeatherMapLayer("rainForecast"));
    cloudButton?.addEventListener("click", () => toggleWeatherMapLayer("clouds"));
    temperatureButton?.addEventListener("click", () => toggleWeatherMapLayer("temperature"));
    playButton?.addEventListener("click", toggleRadarPlayback);
    frameSlider?.addEventListener("input", event => setRainRadarFrame(Number(event.target.value)));
    forecastSlider?.addEventListener("input", event => setWeatherForecastHour(Number(event.target.value)));
    forecastPlayButton?.addEventListener("click", toggleWeatherForecastPlayback);
    satelliteButton?.addEventListener("click", toggleWeatherSatellite);
    satellitePreviousButton?.addEventListener("click", () => stepWeatherSatellite(-1));
    satelliteNextButton?.addEventListener("click", () => stepWeatherSatellite(1));
    satelliteLatestButton?.addEventListener("click", goToLatestWeatherSatellite);
    satellitePlayButton?.addEventListener("click", toggleWeatherSatellitePlayback);
    satelliteTimeSlider?.addEventListener("input", event => {
        weatherSatelliteFallbackAttempts = 0;
        stopWeatherSatellitePlayback();
        updateWeatherSatelliteFrame(Number(event.target.value));
    });
}

function toggleWeatherMapLayer(type) {
    if (!weatherMap) initializeMap();
    if (!weatherMap) return;

    if (type === "radar") {
        rainRadarEnabled = !rainRadarEnabled;
        const button = document.getElementById("radarLayerButton");
        const timeline = document.getElementById("radarTimeline");
        button?.classList.toggle("active", rainRadarEnabled);
        button?.setAttribute("aria-pressed", String(rainRadarEnabled));
        if (timeline) timeline.hidden = !rainRadarEnabled;

        if (rainRadarEnabled) {
            loadRainRadarFrames();
        } else {
            if (rainRadarTimer) clearInterval(rainRadarTimer);
            rainRadarTimer = null;
            if (rainRadarLayer && weatherMap.hasLayer(rainRadarLayer)) weatherMap.removeLayer(rainRadarLayer);
            const playButton = document.getElementById("radarPlayButton");
            if (playButton) playButton.textContent = "▶";
        }
    } else if (type === "rainForecast") {
        precipitationForecastEnabled = !precipitationForecastEnabled;
        const button = document.getElementById("rainLayerButton");
        button?.classList.toggle("active", precipitationForecastEnabled);
        button?.setAttribute("aria-pressed", String(precipitationForecastEnabled));
        if (precipitationForecastEnabled) precipitationForecastLayer?.addTo(weatherMap);
        else precipitationForecastLayer?.remove();
    } else if (type === "clouds") {
        cloudOverlayEnabled = !cloudOverlayEnabled;
        const button = document.getElementById("cloudLayerButton");
        button?.classList.toggle("active", cloudOverlayEnabled);
        button?.setAttribute("aria-pressed", String(cloudOverlayEnabled));
        if (cloudOverlayEnabled) cloudOverlayLayer?.addTo(weatherMap);
        else cloudOverlayLayer?.remove();
    } else if (type === "temperature") {
        temperatureOverlayEnabled = !temperatureOverlayEnabled;
        const button = document.getElementById("temperatureLayerButton");
        button?.classList.toggle("active", temperatureOverlayEnabled);
        button?.setAttribute("aria-pressed", String(temperatureOverlayEnabled));
        if (temperatureOverlayEnabled) temperatureOverlayLayer?.addTo(weatherMap);
        else temperatureOverlayLayer?.remove();
    }

    updateWeatherMapLegend();
    updateWeatherForecastControls();
    if (cloudOverlayEnabled || temperatureOverlayEnabled || precipitationForecastEnabled) refreshWeatherGrid();
}

function updateWeatherForecastControls() {
    const timeline = document.getElementById("weatherForecastTimeline");
    const enabled = cloudOverlayEnabled || temperatureOverlayEnabled || precipitationForecastEnabled;
    if (timeline) timeline.hidden = !enabled;
    if (!enabled && weatherForecastTimer) {
        clearInterval(weatherForecastTimer);
        weatherForecastTimer = null;
        const playButton = document.getElementById("weatherForecastPlayButton");
        if (playButton) {
            playButton.textContent = "▶";
            playButton.setAttribute("aria-label", "Tahmini oynat");
        }
    }
    updateWeatherForecastTimeLabel();
}

function updateWeatherForecastTimeLabel() {
    const label = document.getElementById("weatherForecastTime");
    if (!label) return;
    if (selectedWeatherForecastHour === 0) {
        label.textContent = "Şimdi";
        return;
    }
    const forecastDate = new Date(Date.now() + selectedWeatherForecastHour * 60 * 60 * 1000);
    label.textContent = `+${selectedWeatherForecastHour} sa · ${forecastDate.toLocaleString("tr-TR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    })}`;
}

function setWeatherForecastHour(hour) {
    selectedWeatherForecastHour = Math.max(0, Math.min(48, Math.round(hour)));
    const slider = document.getElementById("weatherForecastSlider");
    if (slider) slider.value = String(selectedWeatherForecastHour);
    updateWeatherForecastTimeLabel();
    if (cloudOverlayEnabled || temperatureOverlayEnabled || precipitationForecastEnabled) refreshWeatherGrid();
}

function toggleWeatherForecastPlayback() {
    const button = document.getElementById("weatherForecastPlayButton");
    if (weatherForecastTimer) {
        clearInterval(weatherForecastTimer);
        weatherForecastTimer = null;
        if (button) {
            button.textContent = "▶";
            button.setAttribute("aria-label", "Tahmini oynat");
        }
        return;
    }
    if (button) {
        button.textContent = "Ⅱ";
        button.setAttribute("aria-label", "Tahmini duraklat");
    }
    weatherForecastTimer = setInterval(() => {
        setWeatherForecastHour(selectedWeatherForecastHour >= 48 ? 0 : selectedWeatherForecastHour + 1);
    }, 900);
}

function updateWeatherMapLegend() {
    const legend = document.getElementById("weatherMapLegend");
    const status = document.getElementById("weatherMapStatus");
    if (!legend) return;

    const items = [];
    if (rainRadarEnabled) items.push("<span>📡 Geçmiş radar görüntüsü</span>");
    if (precipitationForecastEnabled) {
        const rainStops = [
            ["<0,1", "#83d9ff"], ["0,1–0,5", "#38bdf8"], ["0,5–2", "#2563eb"],
            ["2–5", "#7c3aed"], ["5–10", "#c026d3"], [">10", "#dc2626"]
        ];
        items.push(`<div class="map-rain-legend"><strong>🌧️ Yağış miktarı · mm/sa</strong><div class="map-rain-legend-scale">${rainStops.map(([label, color]) => `<span class="map-rain-legend-stop"><i style="background:${color}"></i><small>${label}</small></span>`).join("")}</div><small class="map-rain-legend-note">Renk miktarı, doluluk olasılığı gösterir · hücreye gelerek ayrıntıyı gör</small></div>`);
    }
    if (cloudOverlayEnabled) items.push('<span>☁️ Bulutluluk</span><i class="map-legend-cloud"></i><span>az → çok</span>');
    if (temperatureOverlayEnabled) items.push('<span>🌡️ Sıcaklık</span><i class="map-legend-gradient"></i><span>soğuk → sıcak</span>');

    legend.innerHTML = items.join("");
    if (precipitationForecastEnabled) {
        const rainLegend = legend.querySelector(".map-rain-legend");
        if (rainLegend) {
            const summary = document.createElement("small");
            summary.id = "weatherMapRainSummary";
            summary.className = "map-rain-summary";
            summary.textContent = "Seçili alan özeti hazırlanıyor…";
            rainLegend.append(summary);
        }
    }
    legend.hidden = items.length === 0;
    if (status) {
        const notes = [];
        if (precipitationForecastEnabled) notes.push("Yağış, Open-Meteo saatlik model tahminidir; hücre değerleri yaklaşık gösterilir.");
        if (cloudOverlayEnabled || temperatureOverlayEnabled) notes.push("Diğer hava katmanları da tahmin modeline dayanır.");
        status.textContent = notes.join(" ");
    }
}

async function loadRainRadarFrames() {
    if (!weatherMap || !rainRadarEnabled) return;
    if (rainRadarFrames.length && Date.now() - rainRadarLoadedAt < 8 * 60 * 1000) {
        setRainRadarFrame(rainRadarFrames.length - 1);
        return;
    }

    const timeLabel = document.getElementById("radarFrameTime");
    if (timeLabel) timeLabel.textContent = "Radar alınıyor…";
    try {
        const response = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-cache" });
        if (!response.ok) throw new Error(`Radar servisi (${response.status})`);
        const data = await response.json();
        const frames = data.radar?.past || [];
        if (!data.host || frames.length === 0) throw new Error("Kullanılabilir radar karesi bulunamadı.");

        rainRadarHost = data.host;
        rainRadarFrames = frames;
        rainRadarLoadedAt = Date.now();
        const slider = document.getElementById("radarFrameSlider");
        if (slider) {
            slider.min = "0";
            slider.max = String(frames.length - 1);
        }
        setRainRadarFrame(frames.length - 1);
    } catch (error) {
        if (timeLabel) timeLabel.textContent = "Radar verisi alınamadı";
        console.warn("Yağış radarı yüklenemedi:", error);
    }
}

function setRainRadarFrame(index) {
    if (!weatherMap || !rainRadarFrames.length || !rainRadarHost || !rainRadarEnabled) return;
    rainRadarFrameIndex = Math.max(0, Math.min(index, rainRadarFrames.length - 1));
    const frame = rainRadarFrames[rainRadarFrameIndex];
    const tileUrl = `${rainRadarHost}${frame.path}/256/{z}/{x}/{y}/2/1_0.png`;

    if (!rainRadarLayer) {
        rainRadarLayer = L.tileLayer(tileUrl, {
            minZoom: 3,
            maxZoom: 18,
            maxNativeZoom: 7,
            tileSize: 256,
            opacity: 0.68,
            attribution: 'Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>'
        });
    } else {
        rainRadarLayer.setUrl(tileUrl);
    }
    if (!weatherMap.hasLayer(rainRadarLayer)) rainRadarLayer.addTo(weatherMap);

    const slider = document.getElementById("radarFrameSlider");
    if (slider) slider.value = String(rainRadarFrameIndex);
    const timeLabel = document.getElementById("radarFrameTime");
    if (timeLabel) {
        timeLabel.textContent = new Date(frame.time * 1000).toLocaleTimeString("tr-TR", {
            hour: "2-digit", minute: "2-digit", timeZone: "UTC"
        }) + " UTC";
    }
}

function toggleRadarPlayback() {
    if (!rainRadarEnabled || !rainRadarFrames.length) return;
    const button = document.getElementById("radarPlayButton");
    if (rainRadarTimer) {
        clearInterval(rainRadarTimer);
        rainRadarTimer = null;
        if (button) {
            button.textContent = "▶";
            button.setAttribute("aria-label", "Radarı oynat");
        }
        return;
    }

    if (button) {
        button.textContent = "Ⅱ";
        button.setAttribute("aria-label", "Radarı duraklat");
    }
    rainRadarTimer = setInterval(() => {
        const next = (rainRadarFrameIndex + 1) % rainRadarFrames.length;
        setRainRadarFrame(next);
    }, 850);
}

function scheduleWeatherGridUpdate() {
    if (!cloudOverlayEnabled && !temperatureOverlayEnabled && !precipitationForecastEnabled) return;
    clearTimeout(weatherGridTimer);
    weatherGridTimer = setTimeout(refreshWeatherGrid, 650);
}

async function refreshWeatherGrid() {
    if (!weatherMap || (!cloudOverlayEnabled && !temperatureOverlayEnabled && !precipitationForecastEnabled)) return;
    const bounds = weatherMap.getBounds();
    const north = Math.min(84, bounds.getNorth());
    const south = Math.max(-84, bounds.getSouth());
    let west = bounds.getWest();
    let east = bounds.getEast();
    if (east - west > 360) {
        const center = weatherMap.getCenter().lng;
        west = center - 180;
        east = center + 180;
    }

    // Keep the global grid detailed while limiting the size of each multi-location API response.
    const rows = 5;
    const columns = 7;
    // Snap an overscanned grid to stable geographic steps so small pans can reuse cached data.
    const latitudeStep = Math.max(0.01, (north - south) * 1.2 / rows);
    const longitudeStep = Math.max(0.01, (east - west) * 1.2 / columns);
    const gridCenterLatitude = Math.round(((north + south) / 2) / latitudeStep) * latitudeStep;
    const gridCenterLongitude = Math.round(((west + east) / 2) / longitudeStep) * longitudeStep;
    const cells = [];
    for (let row = 0; row < rows; row++) {
        const cellLatitude = gridCenterLatitude + ((rows - 1) / 2 - row) * latitudeStep;
        const cellNorth = cellLatitude + latitudeStep / 2;
        const cellSouth = cellLatitude - latitudeStep / 2;
        for (let column = 0; column < columns; column++) {
            const cellLongitude = gridCenterLongitude + (column - (columns - 1) / 2) * longitudeStep;
            const cellWest = cellLongitude - longitudeStep / 2;
            const cellEast = cellLongitude + longitudeStep / 2;
            cells.push({
                lat: cellLatitude,
                lon: normalizeLongitude(cellLongitude),
                bounds: [[cellSouth, cellWest], [cellNorth, cellEast]]
            });
        }
    }

    const hourlyFields = [];
    if (temperatureOverlayEnabled) hourlyFields.push("temperature_2m");
    if (cloudOverlayEnabled) hourlyFields.push("cloud_cover");
    if (precipitationForecastEnabled) hourlyFields.push("precipitation_probability", "precipitation");
    const cacheKey = `${hourlyFields.join(",")}|${cells.map(cell => `${cell.lat.toFixed(2)},${cell.lon.toFixed(2)}`).join(";")}`;
    let values = weatherGridCache.get(cacheKey);
    const hasFreshCache = Boolean(values && Date.now() - values.savedAt <= 10 * 60 * 1000);
    if (hasFreshCache) {
        weatherGridController?.abort();
        weatherGridController = null;
        weatherGridRequestKey = null;
        weatherGridRequestId++;
    } else {
        if (openMeteoCooldownUntil > Date.now()) {
            const waitMinutes = Math.max(1, Math.ceil((openMeteoCooldownUntil - Date.now()) / 60000));
            const status = document.getElementById("weatherMapStatus");
            if (status) status.textContent = `Open-Meteo istek sınırı dolu; yaklaşık ${waitMinutes} dk sonra harita verilerini yenile.`;
            return;
        }
        if (weatherGridRequestKey === cacheKey) return;
        weatherGridController?.abort();
        const controller = new AbortController();
        weatherGridController = controller;
        weatherGridRequestKey = cacheKey;
        const requestId = ++weatherGridRequestId;
        const parameters = new URLSearchParams({
            latitude: cells.map(cell => cell.lat.toFixed(2)).join(","),
            longitude: cells.map(cell => cell.lon.toFixed(2)).join(","),
            hourly: hourlyFields.join(","),
            forecast_hours: "49",
            temperature_unit: "celsius",
            timezone: "GMT"
        });
        const status = document.getElementById("weatherMapStatus");
        if (status) status.textContent = "Yeni alanın hava verileri yükleniyor; mevcut harita görünümü korunuyor…";

        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${parameters}`, {
                signal: controller.signal
            });
            if (response.status === 429) registerOpenMeteoRateLimit(response);
            if (!response.ok) throw new Error(`Hava katmanı (${response.status})`);
            const payload = await response.json();
            if (requestId !== weatherGridRequestId) return;
            const locations = Array.isArray(payload) ? payload : [payload];
            values = {
                savedAt: Date.now(),
                locations: locations.map(location => ({
                    time: location.hourly?.time || [],
                    temperature: location.hourly?.temperature_2m || [],
                    clouds: location.hourly?.cloud_cover || [],
                    precipitationProbability: location.hourly?.precipitation_probability || [],
                    precipitation: location.hourly?.precipitation || []
                }))
            };
            weatherGridCache.set(cacheKey, values);
            if (weatherGridCache.size > 8) weatherGridCache.delete(weatherGridCache.keys().next().value);
        } catch (error) {
            if (error.name !== "AbortError" && requestId === weatherGridRequestId && status) status.textContent = "Bu alanın hava verileri alınamadı; haritayı az kaydırıp tekrar deneyebilirsin.";
            if (error.name !== "AbortError" && requestId === weatherGridRequestId) console.warn("Harita hava katmanları yüklenemedi:", error);
            return;
        } finally {
            if (requestId === weatherGridRequestId && weatherGridRequestKey === cacheKey) {
                weatherGridRequestKey = null;
                weatherGridController = null;
            }
        }
    }

    cloudOverlayLayer?.clearLayers();
    temperatureOverlayLayer?.clearLayers();
    precipitationForecastLayer?.clearLayers();
    let rainSignalCount = 0;
    let peakRainAmount = 0;
    let maxRainProbability = 0;
    cells.forEach((cell, index) => {
        const series = values.locations[index];
        const value = series ? {
            temperature: series.temperature[selectedWeatherForecastHour],
            clouds: series.clouds[selectedWeatherForecastHour],
            precipitationProbability: series.precipitationProbability[selectedWeatherForecastHour],
            precipitation: series.precipitation[selectedWeatherForecastHour]
        } : null;
        if (!value) return;

        if (cloudOverlayEnabled && Number.isFinite(value.clouds)) {
            L.rectangle(cell.bounds, {
                stroke: false,
                fillColor: "#83c7ed",
                fillOpacity: 0.06 + value.clouds / 100 * 0.38,
                interactive: false
            }).addTo(cloudOverlayLayer);
        }
        if (temperatureOverlayEnabled && Number.isFinite(value.temperature)) {
            const temperatureCell = L.rectangle(cell.bounds, {
                renderer: temperatureOverlayRenderer,
                stroke: false,
                fillColor: getWeatherMapTemperatureColor(value.temperature),
                fillOpacity: 0.62,
                interactive: true
            }).addTo(temperatureOverlayLayer);
            const forecastTime = series.time[selectedWeatherForecastHour];
            const timeLabel = forecastTime
                ? new Date(`${forecastTime}Z`).toLocaleString("tr-TR", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                })
                : `+${selectedWeatherForecastHour} saat`;
            temperatureCell.bindTooltip(
                `<strong>${escapeHtml(timeLabel)}</strong><br>Sıcaklık: ${formatTemperature(value.temperature)}<br>Yaklaşık konum: ${cell.lat.toFixed(2)}°, ${cell.lon.toFixed(2)}°`,
                { sticky: true, direction: "top", className: "weather-temperature-tooltip" }
            );
        }
        if (precipitationForecastEnabled) {
            const amount = Number.isFinite(value.precipitation) ? Math.max(0, value.precipitation) : 0;
            const probability = Number.isFinite(value.precipitationProbability)
                ? Math.max(0, Math.min(100, value.precipitationProbability))
                : 0;

            if (amount >= 0.05 || probability >= 10) rainSignalCount++;
            if (amount > peakRainAmount) peakRainAmount = amount;
            if (probability > maxRainProbability) maxRainProbability = probability;

            if (amount >= 0.05 || probability >= 10) {
                const forecastTime = series.time[selectedWeatherForecastHour];
                const timeLabel = forecastTime
                    ? new Date(`${forecastTime}Z`).toLocaleString("tr-TR", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                    })
                    : `+${selectedWeatherForecastHour} saat`;
                const probabilityLabel = Number.isFinite(value.precipitationProbability)
                    ? `%${Math.round(probability)}`
                    : "veri yok";
                const rainCell = L.rectangle(cell.bounds, {
                    renderer: precipitationForecastRenderer,
                    stroke: false,
                    fillColor: getPrecipitationForecastColor(amount),
                    fillOpacity: 0.12 + probability / 100 * 0.56,
                    interactive: true
                }).addTo(precipitationForecastLayer);

                rainCell.bindTooltip(
                    `<strong>${escapeHtml(timeLabel)}</strong><br>Yağış: ${formatMillimeters(amount)} mm/sa<br>Olasılık: ${probabilityLabel}<br>Yaklaşık konum: ${cell.lat.toFixed(2)}°, ${cell.lon.toFixed(2)}°`,
                    { sticky: true, direction: "top", className: "rain-forecast-tooltip" }
                );
            }
        }
    });

    if (precipitationForecastRenderer?._container) {
        precipitationForecastRenderer._container.classList.add("rain-smooth-canvas");
    }
    if (temperatureOverlayRenderer?._container) {
        temperatureOverlayRenderer._container.classList.add("temperature-smooth-canvas");
    }

    updateWeatherMapLegend();
    if (precipitationForecastEnabled) {
        const summary = document.getElementById("weatherMapRainSummary");
        if (summary) {
            summary.textContent = rainSignalCount
                ? `Görünen alanda ${rainSignalCount}/${cells.length} noktada yağış sinyali · en yüksek miktar ${formatMillimeters(peakRainAmount)} mm/sa · en yüksek olasılık %${Math.round(maxRainProbability)}`
                : "Seçili saatte görünen alanda belirgin yağış sinyali yok.";
        }
    }
}

function getWeatherMapTemperatureColor(temperature) {
    if (temperature < 0) return "#3288bd";
    if (temperature < 8) return "#66c2a5";
    if (temperature < 16) return "#abdda4";
    if (temperature < 24) return "#fee08b";
    if (temperature < 32) return "#fdae61";
    return "#d53e4f";
}

function getPrecipitationForecastColor(amount) {
    if (amount < 0.1) return "#83d9ff";
    if (amount < 0.5) return "#38bdf8";
    if (amount < 2) return "#2563eb";
    if (amount < 5) return "#7c3aed";
    if (amount < 10) return "#c026d3";
    if (amount < 20) return "#f97316";
    return "#dc2626";
}

/* =========================================================
   HARİTAYI MEVCUT KONUMA GETİR
========================================================= */
function recenterMap() {

    if (
        !weatherMap ||
        currentLatitude === null ||
        currentLongitude === null
    ) {
        return;
    }

    weatherMap.flyTo(
        [
            currentLatitude,
            currentLongitude
        ],
        12,
        {
            duration: 1.2
        }
    );

    if (weatherMarker) {

        setTimeout(() => {

            weatherMarker.openPopup();

        }, 700);
    }
}

/* =========================================================
   HTML GÜVENLİK
========================================================= */
function escapeHtml(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}

/* =========================================================
   HAVA EFEKTLERİ
========================================================= */
function createWeatherEffect(
    code,
    isDay
) {

    const effect =
        document.getElementById(
            "weatherEffect"
        );

    if (!effect) {
        return;
    }

    effect.innerHTML = "";

    /* GECE YILDIZLARI */
    if (isDay === 0) {

        for (
            let i = 0;
            i < 100;
            i++
        ) {

            const star =
                document.createElement(
                    "div"
                );

            star.className =
                "star";

            star.style.left =
                Math.random() * 100 +
                "%";

            star.style.top =
                Math.random() * 75 +
                "%";

            star.style.animationDelay =
                Math.random() * 2 +
                "s";

            effect.appendChild(
                star
            );
        }
    }

    /* BULUT */
    if (
        [1, 2, 3].includes(code)
    ) {

        for (
            let i = 0;
            i < 4;
            i++
        ) {

            const cloud =
                document.createElement(
                    "div"
                );

            cloud.className =
                "cloud";

            cloud.style.top =
                (
                    10 +
                    Math.random() * 45
                ) + "%";

            cloud.style.animationDuration =
                (
                    20 +
                    Math.random() * 20
                ) + "s";

            cloud.style.animationDelay =
                (
                    -Math.random() * 20
                ) + "s";

            effect.appendChild(
                cloud
            );
        }
    }

    /* YAĞMUR */
    if (
        [
            51,
            53,
            55,
            56,
            57,
            61,
            63,
            65,
            66,
            67,
            80,
            81,
            82
        ].includes(code)
    ) {

        for (
            let i = 0;
            i < 110;
            i++
        ) {

            const drop =
                document.createElement(
                    "div"
                );

            drop.className =
                "raindrop";

            drop.style.left =
                Math.random() * 100 +
                "%";

            drop.style.animationDuration =
                (
                    0.5 +
                    Math.random() * 0.7
                ) + "s";

            drop.style.animationDelay =
                (
                    -Math.random() * 2
                ) + "s";

            effect.appendChild(
                drop
            );
        }
    }

    /* KAR */
    if (
        [
            71,
            73,
            75,
            77,
            85,
            86
        ].includes(code)
    ) {

        for (
            let i = 0;
            i < 80;
            i++
        ) {

            const snow =
                document.createElement(
                    "div"
                );

            snow.className =
                "snowflake";

            snow.textContent =
                "❄";

            snow.style.left =
                Math.random() * 100 +
                "%";

            snow.style.animationDuration =
                (
                    5 +
                    Math.random() * 7
                ) + "s";

            snow.style.animationDelay =
                (
                    -Math.random() * 8
                ) + "s";

            snow.style.fontSize =
                (
                    10 +
                    Math.random() * 16
                ) + "px";

            effect.appendChild(
                snow
            );
        }
    }

    /* FIRTINA */
    if (
        [
            95,
            96,
            99
        ].includes(code)
    ) {

        for (
            let i = 0;
            i < 90;
            i++
        ) {

            const drop =
                document.createElement(
                    "div"
                );

            drop.className =
                "raindrop";

            drop.style.left =
                Math.random() * 100 +
                "%";

            drop.style.animationDuration =
                "0.4s";

            effect.appendChild(
                drop
            );
        }

        const lightning =
            document.createElement(
                "div"
            );

        lightning.className =
            "lightning";

        effect.appendChild(
            lightning
        );
    }
}

/* =========================================================
   ŞEHİR ÖNERİ KUTUSU KONUMU
========================================================= */
function positionSuggestionBox() {

    const input =
        document.getElementById(
            "cityInput"
        );

    if (
        !input ||
        !suggestionBox
    ) {
        return;
    }

    const rect =
        input.getBoundingClientRect();

    suggestionBox.style.position =
        "fixed";

    suggestionBox.style.left =
        `${rect.left}px`;

    suggestionBox.style.top =
        `${rect.bottom + 8}px`;

    suggestionBox.style.width =
        `${rect.width}px`;

    suggestionBox.style.zIndex =
        "999999";
}

/* =========================================================
   SAYISAL YARDIMCILAR
========================================================= */
function safeNumber(
    value,
    fallback = 0
) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}
/* =========================================================
   HAVA RENGİ
========================================================= */
let weatherColorInitialized = false;

function injectWeatherColorStyles() {
    if (document.getElementById("weatherColorStyles")) {
        return;
    }

    const style =
        document.createElement("style");

    style.id =
        "weatherColorStyles";

    style.textContent = `
        .weather-color-box{
            grid-column:1 / -1;
            width:100%;
            min-width:0;
            margin-top:18px;
        }

        .weather-color-card{
            position:relative;
            overflow:hidden;
            padding:22px;
            border-radius:24px;
            background:rgba(255,255,255,.30);
            border:1px solid rgba(255,255,255,.62);
            backdrop-filter:blur(18px);
            box-shadow:0 16px 45px rgba(20,70,110,.08);
        }

        .weather-color-preview{
            position:relative;
            height:180px;
            border-radius:20px;
            overflow:hidden;
            display:flex;
            align-items:center;
            justify-content:center;
            transition:
                background .6s ease,
                box-shadow .6s ease;
        }

        .weather-color-glow{
            position:absolute;
            width:230px;
            height:230px;
            border-radius:50%;
            filter:blur(30px);
            opacity:.72;
            transition:
                background .6s ease,
                transform .6s ease;
        }

        .weather-color-center{
            position:relative;
            z-index:2;
            text-align:center;
            color:white;
            text-shadow:
                0 2px 10px rgba(0,0,0,.28);
        }

        .weather-color-icon{
            font-size:46px;
            line-height:1;
            margin-bottom:8px;
        }

        .weather-color-name{
            font-size:20px;
            font-weight:900;
        }

        .weather-color-code{
            margin-top:6px;
            font:800 12px/1.2 ui-monospace,
                SFMono-Regular,
                Menlo,
                monospace;
            opacity:.86;
        }

        .weather-color-info{
            display:grid;
            grid-template-columns:
                repeat(3,minmax(0,1fr));
            gap:10px;
            margin-top:14px;
        }

        .weather-color-stat{
            padding:13px;
            border-radius:15px;
            background:rgba(255,255,255,.22);
            border:1px solid rgba(255,255,255,.32);
        }

        .weather-color-stat span{
            display:block;
            font-size:10px;
            opacity:.56;
            margin-bottom:5px;
        }

        .weather-color-stat strong{
            font-size:14px;
        }

        body.night .weather-color-card{
            background:rgba(15,34,52,.68);
            border-color:rgba(255,255,255,.08);
        }

        body.night .weather-color-stat{
            background:rgba(20,43,66,.48);
            border-color:rgba(255,255,255,.07);
        }

        @media(max-width:600px){
            .weather-color-info{
                grid-template-columns:
                    1fr 1fr;
            }

            .weather-color-preview{
                height:150px;
            }
        }
    `;

    document.head.appendChild(style);
}

function initializeWeatherColor() {

    if (weatherColorInitialized) {
        return;
    }

    injectWeatherColorStyles();

    const weatherContent =
        document.getElementById(
            "weatherContent"
        );

    if (!weatherContent) {
        return;
    }

    const box =
        document.createElement(
            "section"
        );

    box.className =
        "weather-box weather-color-box";

    box.id =
        "weatherColorBox";

    box.innerHTML = `
        <div class="weather-color-card">

            <div
                class="weather-color-preview"
                id="weatherColorPreview"
            >

                <div
                    class="weather-color-glow"
                    id="weatherColorGlow"
                ></div>

                <div
                    class="weather-color-center"
                >

                    <div
                        class="weather-color-icon"
                        id="weatherColorIcon"
                    >
                        🌡️
                    </div>

                    <div
                        class="weather-color-name"
                        id="weatherColorName"
                    >
                        Hava rengi
                    </div>

                    <div
                        class="weather-color-code"
                        id="weatherColorCode"
                    >
                        #------
                    </div>

                </div>

            </div>

            <div class="weather-color-info">

                <div class="weather-color-stat">
                    <span>
                        🌡️ Sıcaklık
                    </span>

                    <strong
                        id="weatherColorTemp"
                    >
                        --
                    </strong>
                </div>

                <div class="weather-color-stat">
                    <span>
                        💧 Nem
                    </span>

                    <strong
                        id="weatherColorHumidity"
                    >
                        --
                    </strong>
                </div>

                <div class="weather-color-stat">
                    <span>
                        💨 Rüzgâr
                    </span>

                    <strong
                        id="weatherColorWind"
                    >
                        --
                    </strong>
                </div>

                <div class="weather-color-stat">
                    <span>
                        ☀️ UV
                    </span>

                    <strong
                        id="weatherColorUV"
                    >
                        --
                    </strong>
                </div>

                <div class="weather-color-stat">
                    <span>
                        🌧️ Yağış
                    </span>

                    <strong
                        id="weatherColorRain"
                    >
                        --
                    </strong>
                </div>

                <div class="weather-color-stat">
                    <span>
                        🧭 Basınç
                    </span>

                    <strong
                        id="weatherColorPressure"
                    >
                        --
                    </strong>
                </div>

            </div>

        </div>
    `;

    weatherContent.appendChild(
        box
    );

    weatherColorInitialized =
        true;
}

function getWeatherColorData(
    weather
) {

    const temperature =
        safeNumber(
            weather.temperature
        );

    const humidity =
        safeNumber(
            weather.humidity
        );

    const wind =
        safeNumber(
            weather.windSpeed
        );

    const rain =
        safeNumber(
            weather.precipitation
        );

    const uv =
        safeNumber(
            weather.uv
        );

    const code =
        safeNumber(
            weather.weatherCode
        );

    let hue;
    let saturation = 78;
    let lightness = 58;
    let name;
    let icon;

    if (
        [95,96,99]
            .includes(code)
    ) {

        hue = 270;
        lightness = 55;
        name = "Fırtınalı hava";
        icon = "⛈️";

    } else if (
        [
            71,
            73,
            75,
            77,
            85,
            86
        ].includes(code)
    ) {

        hue = 205;
        lightness = 72;
        name = "Karlı hava";
        icon = "❄️";

    } else if (
        rain >= 1 ||
        [
            61,
            63,
            65,
            80,
            81,
            82
        ].includes(code)
    ) {

        hue = 205;
        lightness = 58;
        name = "Yağmurlu hava";
        icon = "🌧️";

    } else if (
        [45,48]
            .includes(code)
    ) {

        hue = 190;
        saturation = 35;
        lightness = 57;
        name = "Sisli hava";
        icon = "🌫️";

    } else if (
        temperature >= 35
    ) {

        hue = 8;
        saturation = 84;
        lightness = 55;
        name = "Çok sıcak hava";
        icon = "🔥";

    } else if (
        temperature >= 28
    ) {

        hue = 28;
        saturation = 88;
        lightness = 58;
        name = "Sıcak hava";
        icon = "☀️";

    } else if (
        temperature <= 0
    ) {

        hue = 215;
        saturation = 78;
        lightness = 64;
        name = "Dondurucu hava";
        icon = "🥶";

    } else if (
        temperature <= 8
    ) {

        hue = 200;
        saturation = 70;
        lightness = 60;
        name = "Soğuk hava";
        icon = "🧊";

    } else if (
        temperature <= 16
    ) {

        hue = 190;
        saturation = 62;
        lightness = 57;
        name = "Serin hava";
        icon = "🌤️";

    } else {

        hue = 145;
        saturation = 65;
        lightness = 55;
        name = "Ilıman hava";
        icon = "🌤️";
    }

    if (
        humidity >= 85
    ) {
        saturation =
            Math.min(
                100,
                saturation + 5
            );
    }

    if (
        wind >= 40
    ) {
        lightness =
            Math.max(
                45,
                lightness - 4
            );
    }

    return {
        hue,
        saturation,
        lightness,
        name,
        icon
    };
}

function hashString(value) {
    let hash = 2166136261;
    const text = String(value ?? "");

    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}
function updateWeatherColor(
    weather
) {

    try {

        initializeWeatherColor();

        const preview =
            document.getElementById(
                "weatherColorPreview"
            );

        const glow =
            document.getElementById(
                "weatherColorGlow"
            );

        if (
            !preview ||
            !glow
        ) {
            return;
        }

        const color =
            getWeatherColorData(
                weather
            );

        const base =
            `hsl(${color.hue} ${color.saturation}% ${color.lightness}%)`;

        const lighter =
            `hsl(${color.hue} ${Math.min(
                100,
                color.saturation + 8
            )}% ${Math.min(
                90,
                color.lightness + 14
            )}%)`;

        const darker =
            `hsl(${color.hue} ${Math.min(
                100,
                color.saturation + 4
            )}% ${Math.max(
                30,
                color.lightness - 18
            )}%)`;

        preview.style.background =
            `linear-gradient(
                135deg,
                ${lighter},
                ${base} 52%,
                ${darker}
            )`;

        glow.style.background =
            `radial-gradient(
                circle,
                ${lighter},
                transparent 70%
            )`;

        setText(
            "weatherColorIcon",
            color.icon
        );

        setText(
            "weatherColorName",
            color.name
        );

        const hash =
            hashString(
                [
                    weather.latitude,
                    weather.longitude,
                    weather.temperature,
                    weather.humidity,
                    weather.windSpeed,
                    weather.precipitation,
                    weather.uv,
                    weather.weatherCode
                ].join("|")
            );

        const colorCode =
            `#${(
                (
                    (
                        Math.round(
                            color.hue
                        ) * 1000000
                    ) +
                    (
                        Math.round(
                            color.saturation
                        ) * 1000
                    ) +
                    Math.round(
                        color.lightness
                    )
                ) ^
                hash
            >>> 0)
                .toString(16)
                .toUpperCase()
                .padStart(
                    8,
                    "0"
                )
                .slice(0, 6)}`;

        setText(
            "weatherColorCode",
            colorCode
        );

        setText(
            "weatherColorTemp",
            formatTemperature(weather.temperature)
        );

        setText(
            "weatherColorHumidity",
            `${Math.round(
                safeNumber(
                    weather.humidity
                )
            )}%`
        );

        setText(
            "weatherColorWind",
            formatWindSpeed(weather.windSpeed)
        );

        setText(
            "weatherColorUV",
            Number.isFinite(
                Number(weather.uv)
            )
                ? Number(
                    weather.uv
                ).toFixed(1)
                : "--"
        );

        setText(
            "weatherColorRain",
            `${formatMillimeters(
                safeNumber(
                    weather.precipitation
                )
            )} mm`
        );

        setText(
            "weatherColorPressure",
            Number.isFinite(
                Number(weather.pressure)
            )
                ? `${Math.round(
                    Number(
                        weather.pressure
                    )
                )} hPa`
                : "--"
        );

    } catch (error) {

        console.error(
            "Hava rengi:",
            error
        );
    }
}

/* =========================================================
   YENİ HAVA ÖZELLİKLERİNİ TEK YERDEN GÜNCELLE
========================================================= */
function updateAllNewWeatherFeatures(data) {
    const current = data?.current;
    if (!current) return;

    const weather = {
        latitude: data.latitude,
        longitude: data.longitude,
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        windDirection: current.wind_direction_10m,
        precipitation: current.precipitation,
        pressure: current.pressure_msl,
        uv: current.uv_index,
        weatherCode: current.weather_code,
        isDay: current.is_day
    };

    // Bu, gönderilen dosyalarda tanımlı olan ek hava özelliğidir.
    updateWeatherColor(weather);
}

/* =========================================================
   3D GLOBE
========================================================= */
let globeInstance = null;
let globeInitialized = false;
let globeAutoRotate = false;
let globeClockInterval = null;
let globeEarthImage = null;
let globeEarthImageLoading = false;
let globeDayNightCanvas = null;
let globeDayNightContext = null;
let globeBaseImageData = null;
let globeWorkingImageData = null;
let globeCountryBorderPaths = null;
let globeCountryBordersLoading = false;

function showGlobeError(message) {
    const error = document.getElementById("globeError");
    const detail = document.getElementById("globeErrorDetail");
    if (detail && message) detail.textContent = message;
    error?.classList.remove("is-hidden");
}
function setGlobeLoading(isLoading, message = "Dünya yükleniyor…") {
    const overlay = document.getElementById("globeLoading");
    const text = document.getElementById("globeLoadingText");
    const error = document.getElementById("globeError");

    if (text) text.textContent = message;
    if (overlay) overlay.classList.toggle("is-hidden", !isLoading);
    // Başarılı yüklemede hata kutusunu açma; yalnızca showGlobeError görünür yapar.
    if (isLoading) error?.classList.add("is-hidden");
}

function updateGlobeReadouts() {
    const city = document.getElementById("cityName")?.textContent?.trim() || "Konum seçilmedi";
    const temperature = document.getElementById("temperature")?.textContent?.trim() || "--°";
    const cityOutput = document.getElementById("globeCurrentCity");
    const temperatureOutput = document.getElementById("globeCurrentTemp");
    const coordinateOutput = document.getElementById("globeCoordinates");

    if (cityOutput) cityOutput.textContent = city;
    if (temperatureOutput) temperatureOutput.textContent = temperature;
    if (coordinateOutput) {
        coordinateOutput.textContent = currentLatitude !== null && currentLongitude !== null
            ? `${Number(currentLatitude).toFixed(4)}°, ${Number(currentLongitude).toFixed(4)}°`
            : "Önce bir şehir ara";
    }
}

function initializeGlobe() {
    if (globeInitialized || typeof Globe === "undefined") return;

    const container = document.getElementById("globeContainer");
    if (!container) return;

    try {
        const width = Math.max(container.clientWidth, 320);
        const height = Math.max(container.clientHeight, 300);

        globeInstance = new Globe(container)
            .width(width)
            .height(height)
            .backgroundColor("rgba(0,0,0,0)")
            .globeImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg")
            .bumpImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png")
            .backgroundImageUrl("https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png")
            .showGraticules(true)
            .showAtmosphere(true)
            .atmosphereColor("#62c8ff")
            .atmosphereAltitude(0.12)
            .pointsData([])
            .pointLat("lat")
            .pointLng("lng")
            .pointColor(() => "#8be9ff")
            .pointAltitude(0.035)
            .pointRadius(0.42)
            .pointLabel("label")
            .ringsData([])
            .ringLat("lat")
            .ringLng("lng")
            .ringColor(() => t => `rgba(95, 220, 255, ${1 - t})`)
            .ringMaxRadius(5)
            .ringPropagationSpeed(2)
            .ringRepeatPeriod(1400)
            .pathsData(globeCountryBorderPaths || [])
            .pathPoints(d => d.points)
            .pathPointLat(point => point[0])
            .pathPointLng(point => point[1])
            .pathPointAlt(0.0015)
            .pathColor(() => "#83a9bd")
            .pathResolution(2)
            .onGlobeReady(() => {
                setGlobeLoading(false);
                updateGlobeLocation();
                if (!globeEarthImage && !globeEarthImageLoading) loadGlobeEarthImage();
                loadGlobeCountryBorders();
            });

        const controls = globeInstance.controls();
        controls.autoRotate = globeAutoRotate;
        controls.autoRotateSpeed = 0.32;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;

        // HiDPI ekranlarda gereksiz büyük canvas çizimini sınırlayarak WebGL yükünü azalt.
        const renderer = typeof globeInstance.renderer === "function"
            ? globeInstance.renderer()
            : null;
        if (renderer?.setPixelRatio) {
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        }

        globeInitialized = true;
        updateGlobeLocation();

        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(() => resizeGlobe());
            observer.observe(container);
            container._globeResizeObserver = observer;
        }
    } catch (error) {
        console.error("3D Dünya başlatılamadı:", error);
        setGlobeLoading(false);
        showGlobeError(error?.message || "3D motoru başlatılamadı. WebGL desteğini kontrol et.");
    }
}

function resizeGlobe() {
    if (!globeInstance) return;
    const container = document.getElementById("globeContainer");
    if (!container) return;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 300);
    globeInstance.width(width).height(height);
}

function normalizeLongitude(longitude) {
    return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function loadGlobeCountryBorders() {
    if (globeCountryBorderPaths) {
        globeInstance?.pathsData(globeCountryBorderPaths);
        return;
    }
    if (globeCountryBordersLoading || !globeInstance) return;

    globeCountryBordersLoading = true;
    fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson")
        .then(response => {
            if (!response.ok) throw new Error(`Sınır verisi alınamadı (${response.status})`);
            return response.json();
        })
        .then(data => {
            const paths = [];
            const addPolygon = rings => {
                for (const ring of rings || []) {
                    const points = ring
                        .filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
                        .map(([longitude, latitude]) => [latitude, longitude]);
                    if (points.length > 1) paths.push({ points });
                }
            };

            for (const feature of data.features || []) {
                const geometry = feature.geometry;
                if (geometry?.type === "Polygon") addPolygon(geometry.coordinates);
                if (geometry?.type === "MultiPolygon") {
                    for (const polygon of geometry.coordinates) addPolygon(polygon);
                }
            }

            globeCountryBorderPaths = paths;
            globeInstance?.pathsData(paths);
        })
        .catch(error => console.warn("Ülke sınırları yüklenemedi:", error))
        .finally(() => {
            globeCountryBordersLoading = false;
        });
}

// NOAA-style solar position approximation using the current UTC time.
function getLiveSunPosition(date = new Date()) {
    const dayOfYear = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
    const minutesUtc = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    const gamma = 2 * Math.PI / 365 * (dayOfYear - 1 + (minutesUtc / 60 - 12) / 24);
    const equationOfTime = 229.18 * (
        0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
        - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
    );
    const declination =
        0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
        - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
        - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

    return {
        latitude: declination * 180 / Math.PI,
        longitude: normalizeLongitude(-15 * (minutesUtc - 720 + equationOfTime) / 60)
    };
}

function loadGlobeEarthImage() {
    if (globeEarthImage || globeEarthImageLoading) return;
    globeEarthImageLoading = true;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
        globeEarthImageLoading = false;
        globeEarthImage = image;

        const width = 1024;
        const height = 512;
        globeDayNightCanvas = document.createElement("canvas");
        globeDayNightCanvas.width = width;
        globeDayNightCanvas.height = height;
        globeDayNightContext = globeDayNightCanvas.getContext("2d", { willReadFrequently: true });
        if (!globeDayNightContext) return;

        try {
            globeDayNightContext.drawImage(image, 0, 0, width, height);
            globeBaseImageData = globeDayNightContext.getImageData(0, 0, width, height);
            globeWorkingImageData = globeDayNightContext.createImageData(width, height);
            updateGlobeDayNight();
        } catch (error) {
            globeEarthImage = null;
            console.warn("Dünya dokusu canvas üzerinde işlenemedi:", error);
        }
    };
    image.onerror = () => {
        globeEarthImageLoading = false;
        console.warn("Dünya haritası dokusu gündüz/gece için işlenemedi; temel küre görünümü korunuyor.");
    };
    image.src = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";
}

function applyDayNightTexture(sun) {
    if (!globeInstance || !globeDayNightContext || !globeBaseImageData || !globeWorkingImageData) return;

    const { width, height, data: base } = globeBaseImageData;
    const output = globeWorkingImageData.data;
    const sunLat = sun.latitude * Math.PI / 180;
    const sunLon = sun.longitude * Math.PI / 180;
    const sinSunLat = Math.sin(sunLat);
    const cosSunLat = Math.cos(sunLat);
    const longitudeFactors = new Float32Array(width);
    const latitudeSin = new Float32Array(height);
    const latitudeCos = new Float32Array(height);

    for (let x = 0; x < width; x++) {
        const longitude = (x / width * 360 - 180) * Math.PI / 180;
        longitudeFactors[x] = Math.cos(longitude - sunLon);
    }
    for (let y = 0; y < height; y++) {
        const latitude = (90 - y / height * 180) * Math.PI / 180;
        latitudeSin[y] = Math.sin(latitude);
        latitudeCos[y] = Math.cos(latitude);
    }

    for (let y = 0; y < height; y++) {
        const rowSun = latitudeSin[y] * sinSunLat;
        const rowScale = latitudeCos[y] * cosSunLat;
        for (let x = 0; x < width; x++) {
            const pixel = (y * width + x) * 4;
            const sunlit = rowSun + rowScale * longitudeFactors[x];
            const blend = Math.max(0, Math.min(1, (sunlit + 0.12) / 0.24));
            const smoothDay = blend * blend * (3 - 2 * blend);
            const shade = 0.2 + 0.8 * smoothDay;
            const twilight = Math.max(0, 1 - Math.abs(sunlit) / 0.12) * 0.12;

            output[pixel] = Math.min(255, base[pixel] * shade + twilight * 22);
            output[pixel + 1] = Math.min(255, base[pixel + 1] * shade + twilight * 10);
            output[pixel + 2] = Math.min(255, base[pixel + 2] * shade);
            output[pixel + 3] = base[pixel + 3];
        }
    }

    globeDayNightContext.putImageData(globeWorkingImageData, 0, 0);
    globeInstance.globeImageUrl(globeDayNightCanvas.toDataURL("image/jpeg", 0.9));
}

function updateGlobeDayNight() {
    const sun = getLiveSunPosition();
    const now = new Date();
    const status = document.getElementById("globeStatusText");
    const utc = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} UTC`;
    const lat = `${Math.abs(sun.latitude).toFixed(1)}°${sun.latitude >= 0 ? "K" : "G"}`;
    const lng = `${Math.abs(sun.longitude).toFixed(1)}°${sun.longitude >= 0 ? "D" : "B"}`;

    if (status) status.textContent = `Güneş altı noktası ${lat}, ${lng} · ${utc} · canlı`;
    applyDayNightTexture(sun);
}

function startGlobeLiveClock() {
    if (globeClockInterval) clearInterval(globeClockInterval);
    updateGlobeDayNight();
    globeClockInterval = setInterval(updateGlobeDayNight, 60000);
}
function updateGlobeLocation() {
    updateGlobeReadouts();
    if (!globeInstance) return;

    if (currentLatitude === null || currentLongitude === null) {
        globeInstance.pointOfView({ lat: 20, lng: 10, altitude: 2.15 }, 900);
        return;
    }

    const lat = Number(currentLatitude);
    const lng = Number(currentLongitude);
    const city = document.getElementById("cityName")?.textContent?.trim() || "Seçili konum";

    globeInstance
        .pointsData([{ lat, lng, label: city }])
        .ringsData([{ lat, lng }])
        .pointOfView({ lat, lng, altitude: 1.55 }, 1200);
}

function toggleGlobeRotation() {
    if (!globeInstance) return;
    globeAutoRotate = !globeAutoRotate;
    globeInstance.controls().autoRotate = globeAutoRotate;

    const button = document.getElementById("globeRotateButton");
    if (button) {
        button.classList.toggle("is-active", globeAutoRotate);
        button.setAttribute("aria-pressed", String(globeAutoRotate));
        button.innerHTML = globeAutoRotate ? "⏸ Döndürmeyi durdur" : "↻ Otomatik döndür";
    }
}
function loadGlobeLibrary() {
    if (typeof Globe !== "undefined") {
        initializeGlobe();
        return;
    }

    setGlobeLoading(true, "3D Dünya kitaplığı yükleniyor…");
    const existingScript = document.getElementById("globeLibraryScript");
    if (existingScript) return;

    const script = document.createElement("script");
    script.id = "globeLibraryScript";
    const sources = [
        "https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js",
        "https://unpkg.com/globe.gl@2.46.2/dist/globe.gl.min.js"
    ];
    let sourceIndex = 0;

    script.async = true;
    script.onload = () => {
        initializeGlobe();
    };
    script.onerror = () => {
        if (sourceIndex < sources.length) {
            script.src = sources[sourceIndex++];
            return;
        }
        setGlobeLoading(false);
        showGlobeError("Globe.gl dosyası iki CDN kaynağından da alınamadı. İnternet bağlantısını veya ağ engelini kontrol et.");
        console.error("Globe.gl iki CDN kaynağından da yüklenemedi.");
    };
    script.src = sources[sourceIndex++];
    document.head.appendChild(script);
}
/* ========================================================= 
   3D GLOBE BUTONU / ALANI 
========================================================= */ 
function initializeGlobeUI() {
    const button = document.getElementById("openGlobeButton");
    const modal = document.getElementById("globeModal");
    const closeButton = document.getElementById("closeGlobeButton");
    const locateButton = document.getElementById("globeLocateButton");
    const rotateButton = document.getElementById("globeRotateButton");
    const retryButton = document.getElementById("globeRetryButton");

    if (!button || !modal) return;

    const closeModal = () => {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("globe-modal-open");
        if (globeClockInterval) {
            clearInterval(globeClockInterval);
            globeClockInterval = null;
        }
        button.focus();
    };

    button.addEventListener("click", () => {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("globe-modal-open");
        updateGlobeReadouts();
        startGlobeLiveClock();

        if (!globeInitialized) {
            setGlobeLoading(true, "3D Dünya yükleniyor…");
            loadGlobeLibrary();
        } else {
            setGlobeLoading(false);
            resizeGlobe();
            updateGlobeLocation();
        }

        closeButton?.focus();
    });

    closeButton?.addEventListener("click", closeModal);
    modal.addEventListener("click", event => {
        if (event.target === modal) closeModal();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal.classList.contains("show")) closeModal();
    });

    locateButton?.addEventListener("click", () => {
        if (currentLatitude === null || currentLongitude === null) {
            document.getElementById("globeStatusText").textContent = "Önce şehir arayın veya konumunuzu kullanın.";
            return;
        }
        updateGlobeLocation();
    });

    rotateButton?.addEventListener("click", toggleGlobeRotation);
    retryButton?.addEventListener("click", () => {
        document.getElementById("globeLibraryScript")?.remove();
        globeInitialized = false;
        globeInstance = null;
        document.getElementById("globeContainer").replaceChildren();
        document.getElementById("globeError")?.classList.add("is-hidden");
        setGlobeLoading(true, "3D Dünya yeniden yükleniyor…");
        loadGlobeLibrary();
    });
}
/* ========================================================= 
   DOM HAZIR OLDUĞUNDA 
========================================================= */ 
document.addEventListener( 
    "DOMContentLoaded", 
    () => { 

        initializeUnitPreferences();
        initializeFavoriteCities();
 
        try { 
            initializeCityAutocomplete(); 
        } catch (error) { 
            console.error( 
                "Şehir önerileri:", 
                error 
            ); 
        } 
 
        try {
            injectWeatherColorStyles(); 
 
        } catch (error) { 
 
            console.error( 
                "Kart stilleri:", 
                error 
            ); 
        } 
 
        try { 
 
            initializeMap();
            attachMapClickHandler();
            initializeWeatherMapLayers();
 
        } catch (error) { 
 
            console.error( 
                "Harita başlangıcı:", 
                error 
            ); 
        } 
 
        try { 
            initializeGlobeUI(); 
        } catch (error) { 
            console.error( 
                "Globe arayüzü:", 
                error 
            ); 
        } 
 
        const input = 
            document.getElementById( 
                "cityInput" 
            ); 
 
        const inputObserver = 
            () => { 
                positionSuggestionBox(); 
            }; 
 
        window.addEventListener( 
            "resize", 
            inputObserver, 
            { 
                passive: true 
            } 
        ); 
 
        window.addEventListener( 
            "scroll", 
            inputObserver, 
            { 
                passive: true 
            } 
        ); 
 
        input?.addEventListener( 
            "focus", 
            inputObserver 
        ); 
 
        /* Sesli bülten butonunu başlat */
        try {
            initVoiceBulletinButton();
        } catch (error) {
            console.warn("Sesli bülten başlatılamadı:", error);
        }

        /* İlk harita boyutlandırması */ 
        setTimeout(() => { 
 
            if (weatherMap) { 
                weatherMap.invalidateSize( 
                    true 
                ); 
            } 
 
        }, 800); 
    } 
); 

/* =========================================================
MOBİL SEKME SİSTEMİ
Sadece 760px ve altındaki ekranlarda çalışır.
Masaüstüne dokunmaz.
========================================================= */

(function initMobileTabs() {

```
function setupMobileTabs() {

    const dashboard = document.getElementById("weatherContent");

    if (!dashboard) return;

    /* Daha önce oluşturulduysa tekrar oluşturma */
    if (document.getElementById("mobileTabs")) return;

    const tabs = document.createElement("div");

    tabs.id = "mobileTabs";
    tabs.className = "mobile-tabs";

    tabs.innerHTML = `
        <button class="mobile-tab active" data-tab="general">
            ☀️ Genel
        </button>

        <button class="mobile-tab" data-tab="forecast">
            📅 Tahmin
        </button>

        <button class="mobile-tab" data-tab="atmosphere">
            🌫️ Atmosfer
        </button>

        <button class="mobile-tab" data-tab="wind">
            💨 Rüzgâr
        </button>

        <button class="mobile-tab" data-tab="sun">
            🌅 Güneş & Ay
        </button>

        <button class="mobile-tab" data-tab="map">
            🗺️ Harita
        </button>
    `;

    /*
     * Sekmeleri şehir başlığının hemen altına koy.
     */
    const cityTitle = dashboard.querySelector(".city-title");

    if (cityTitle) {
        cityTitle.insertAdjacentElement("afterend", tabs);
    } else {
        dashboard.prepend(tabs);
    }

    /*
     * Ana bölümleri bul
     */
    const currentBox = dashboard.querySelector(".current-box");
    const forecastBox = dashboard.querySelector(".forecast-box");

    const lifestyleBox = dashboard.querySelector(".lifestyle-box");
    const minuteRainBox = dashboard.querySelector(".minute-rain-box");

    const atmosphereBox = dashboard.querySelector(".atmosphere-box");
    const windBox = dashboard.querySelector(".wind-box");

    const temperatureChartBox =
        dashboard.querySelector(".temperature-chart-box");

    const hourlyBox =
        dashboard.querySelector(".hourly-box");

    const sunBox =
        dashboard.querySelector(".sun-box");

    const moonBox =
        dashboard.querySelector(".moon-box");

    const mapBox =
        dashboard.querySelector(".map-box");

    const radarBox =
        dashboard.querySelector(".rain-radar-box");

    const weatherColorBox =
        dashboard.querySelector("#weatherColorBox");

    const alertsBox =
        dashboard.querySelector("#weatherAlertsContainer");


    /*
     * Sekmelere ait bölümleri belirle
     */
    const sections = {

        general: [
            currentBox,
            lifestyleBox,
            minuteRainBox,
            alertsBox,
            weatherColorBox
        ],

        forecast: [
            forecastBox,
            temperatureChartBox,
            hourlyBox
        ],

        atmosphere: [
            atmosphereBox
        ],

        wind: [
            windBox
        ],

        sun: [
            sunBox,
            moonBox
        ],

        map: [
            mapBox,
            radarBox
        ]
    };


    /*
     * Tüm bölümleri gizle
     */
    function hideAllSections() {

        Object.values(sections).flat().forEach(section => {

            if (!section) return;

            section.classList.remove("mobile-section-visible");
            section.classList.add("mobile-section-hidden");

        });
    }


    /*
     * Seçilen sekmeyi göster
     */
    function showTab(tabName) {

        hideAllSections();

        const selectedSections = sections[tabName] || [];

        selectedSections.forEach(section => {

            if (!section) return;

            section.classList.remove("mobile-section-hidden");
            section.classList.add("mobile-section-visible");

        });

        /*
         * Aktif buton
         */
        tabs.querySelectorAll(".mobile-tab").forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.tab === tabName
            );

        });

        /*
         * Sayfanın ilgili bölümüne yumuşak dönüş
         */
        tabs.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }


    /*
     * Butonlara tıklama
     */
    tabs.querySelectorAll(".mobile-tab").forEach(button => {

        button.addEventListener("click", () => {

            showTab(button.dataset.tab);

        });

    });


    /*
     * Başlangıçta Genel sekmesi
     */
    showTab("general");


    /*
     * Masaüstünde hiçbir bölümü gizleme.
     * Ekran tekrar büyürse eski PC görünümüne dön.
     */
    function checkScreenSize() {

        const isMobile = window.matchMedia(
            "(max-width: 760px)"
        ).matches;

        if (isMobile) {

            tabs.style.display = "flex";

            const activeButton =
                tabs.querySelector(".mobile-tab.active");

            showTab(
                activeButton
                    ? activeButton.dataset.tab
                    : "general"
            );

        } else {

            tabs.style.display = "none";

            Object.values(sections).flat().forEach(section => {

                if (!section) return;

                section.classList.remove(
                    "mobile-section-hidden",
                    "mobile-section-visible"
                );

            });

        }

    }

    window.addEventListener(
        "resize",
        checkScreenSize
    );

    checkScreenSize();

}


/*
 * Sayfa tamamen hazır olduğunda çalıştır.
 */
if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        setupMobileTabs
    );

} else {

    setupMobileTabs();

}
```

})();
