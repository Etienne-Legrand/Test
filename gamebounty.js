const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://gamebounty.world";

module.exports = {
  name: "GameBounty",
  // Liste des catégories/genres les plus courants disponibles sur GameBounty
  categories: [
    "action",
    "adventure",
    "casual",
    "indie",
    "rpg",
    "simulation",
    "strategy",
    "racing",
    "sports",
    "horror",
    "platformer",
    "early-access",
    "adult-only"
  ],
  capabilities: {
    hasCategoryPagination: true,
    hasSearchPagination: true,
  },

  // Nettoie les suffixes fréquents pour ne garder que le titre propre du jeu
  _cleanName(name) {
    return name.includes("- Free PC")
      ? name.split("- Free PC")[0].trim()
      : name.replace(/Free PC Download/g, "").trim();
  },

  // Récupère les jeux mis en avant ou récents sur la page d'accueil
  async get_homepage_games() {
    try {
      const { data } = await axios.get(BASE_URL);
      const $ = cheerio.load(data);
      const results = [];

      // GameBounty utilise généralement une structure d'articles ou de cartes de grille de jeux
      // On cible les conteneurs de cartes de jeux standards (.game-card ou structure équivalente de leur grille)
      $("div.game-card, .game-item, div[class*='grid'] a[href*='/the-']").each((_, el) => {
        const titleTag = $(el).find("h3, h2, .title");
        let name = titleTag.text().trim();
        let game_page_link = $(el).attr("href") || $(el).find("a").attr("href");

        if (!name && game_page_link) {
          // Si le lien englobe toute la carte, on extrait le texte interne
          name = $(el).text().trim().split("\n")[0];
        }

        if (!game_page_link) return;
        if (!game_page_link.startsWith("http")) game_page_link = BASE_URL + game_page_link;

        const img = $(el).find("img");
        const thumbnail_link = img.attr("data-src") || img.attr("src");

        // Extraction des tags/catégories si présents sur la carte
        const categories = [];
        $(el).find(".genres a, .tags a").each((_, cat) => {
          categories.push($(cat).text().trim().toLowerCase());
        });

        results.push({
          name: this._cleanName(name),
          thumbnail_link,
          categories,
          url: game_page_link,
          download_links: [],
        });
      });

      return results;
    } catch (e) {
      return [];
    }
  },

  // Gère la recherche globale de jeux avec pagination standard (?page=X)
  async search_games(query, page_number = 1) {
    const formattedQuery = encodeURIComponent(query);
    // Structure d'URL de recherche de GameBounty
    const url = `${BASE_URL}/?s=${formattedQuery}&page=${page_number}`;
    return this._scrapeGrid(url);
  },

  // Gère le filtrage par catégorie/genre avec pagination (?page=X)
  async get_games_by_category(category, page_number = 1) {
    // Structure d'URL des genres sur GameBounty
    const url = `${BASE_URL}/genre/${category}?page=${page_number}`;
    return this._scrapeGrid(url);
  },

  // Fonction utilitaire interne pour scraper les structures de grilles (Search et Catégories)
  async _scrapeGrid(url) {
    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);
      const results = [];

      // Analyse de la grille d'affichage des résultats de recherche
      $("div.grid-item, .game-list-item, a.game-link").each((_, game) => {
        const titleTag = $(game).find(".game-title, h2, h3").first();
        const name = titleTag.text().length ? titleTag.text().trim() : $(game).attr("title");
        let link = $(game).attr("href") || $(game).find("a").attr("href");

        if (!link) return;
        if (!link.startsWith("http")) link = BASE_URL + link;

        const img = $(game).find("img");
        const thumbnail = img.attr("data-src") || img.attr("src");

        results.push({
          name: this._cleanName(name || ""),
          thumbnail_link: thumbnail,
          categories: [],
          url: link,
          download_links: [],
        });
      });
      return results;
    } catch (e) {
      return [];
    }
  },

  // Entre dans la fiche du jeu et extrait TOUS les liens de téléchargements (FilesYard, FileDitch, VikingFile...)
  async get_game_details(url) {
    try {
      const res = await axios.get(url);
      const $ = cheerio.load(res.data);
      const download_links = [];

      // GameBounty place ses liens de téléchargement dans une section dédiée (généralement dans la div ou section #download)
      // On cherche tous les liens sortants vers des hébergeurs de fichiers dans la zone de téléchargement
      $("a[href*='filesyard'], a[href*='fileditch'], a[href*='vikingfile'], .download-btn, a:contains('Download')").each((_, el) => {
        let dl = $(el).attr("href");
        if (dl) {
          if (dl.startsWith("//")) dl = "https:" + dl;
          // Évite de récupérer des liens internes de navigation ou d'aide du site
          if (dl.startsWith("/") && !dl.startsWith("//")) dl = BASE_URL + dl;
          
          if (!download_links.includes(dl) && !dl.includes("/help/")) {
            download_links.push(dl);
          }
        }
      });
      
      return { download_links };
    } catch (err) {
      return { download_links: [] };
    }
  },
};
