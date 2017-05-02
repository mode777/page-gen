"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const doT = require("dot");
const marked = require("marked");
const _ = require("underscore");
const glob = require("glob");
const mkdirp = require("mkdirp");
const hljs = require("highlight.js");
const fsx = require("fs-extra");
const chokidar = require("chokidar");
const program = require("commander");
doT.templateSettings.strip = false;
const CONFIG_DEFAULT = {
    prefix: "/",
    out: "out",
    layout: "layout",
    content: "content",
    assets: "assets"
};
let cli = program
    .version('1.1.1')
    .command("page-gen")
    .description("Creates a new website for given directory or working directory")
    .arguments("[root]")
    .option('-w, --watch', 'watch mode')
    .parse(process.argv);
const ROOT = (cli.args[0] ? path.join(process.cwd(), cli.args[0]) : process.cwd());
const WATCH = cli["watch"];
const CONFIG = _.extend({}, CONFIG_DEFAULT, fs.existsSync(path.join(ROOT, "page.config.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "page.config.json"), "utf8")) : {});
// set paths
const CONTENT = path.join(ROOT, CONFIG.content);
const LAYOUT = path.join(ROOT, CONFIG.layout);
const OUT = path.join(ROOT, CONFIG.out);
const ASSETS = path.join(ROOT, CONFIG.assets);
if (WATCH) {
    if (path.relative(ROOT, OUT)[0] != ".")
        throw "Watch mode is not supported if out directory is within root. Try to configure the 'out' options in page.config.json";
    let build = false;
    let watcher = chokidar.watch(ROOT, { persistent: true });
    let callback = (f) => {
        build = true;
        setTimeout(() => {
            if (build) {
                console.log("Rebuilding... " + new Date());
                main(ROOT, CONTENT, LAYOUT, ASSETS, OUT, CONFIG, WATCH);
                build = false;
            }
        }, 1000);
    };
    watcher
        .on('add', callback)
        .on('change', callback)
        .on('unlink', callback)
        .on('error', callback);
}
else {
    main(ROOT, CONTENT, LAYOUT, ASSETS, OUT, CONFIG, WATCH);
}
function main(ROOT, CONTENT, LAYOUT, ASSETS, OUT, CONFIG, isWatching) {
    // collect files
    const CONTENT_FILES = glob.sync(path.join(CONTENT, "**/*.*"));
    const LAYOUT_FILES = glob.sync(path.join(LAYOUT, "**/*.*"));
    const ASSET_FILES = glob.sync(path.join(ASSETS, "**/*.*"));
    // Create page-templates
    function createPage(filename) {
        let page = {
            path: filename,
            rawContent: fs.readFileSync(filename, "utf8"),
            name: path.basename(filename).replace(/\.[^/.]+$/, ""),
            filename: path.basename(filename),
            folder: path.dirname(filename),
            ext: path.extname(filename),
            userData: {}
        };
        page.isMarkdown = page.ext.toLocaleUpperCase() == ".MD";
        page.template = doT.template(page.rawContent, null, page.userData);
        page.outPath = path.join(path.relative(CONTENT, page.folder), page.name + ".html");
        page.href = CONFIG.prefix + page.outPath;
        return page;
    }
    const CONTENT_PAGES = CONTENT_FILES.map(createPage);
    const LAYOUT_PAGES = LAYOUT_FILES.map(createPage);
    // Build layout graph
    const LAYOUTS_BY_NAME = {};
    LAYOUT_PAGES.forEach(x => LAYOUTS_BY_NAME[x.name] = x);
    LAYOUT_PAGES.forEach(x => x.layout = LAYOUTS_BY_NAME[x.userData.$layout]);
    CONTENT_PAGES.forEach(x => x.layout = LAYOUTS_BY_NAME[x.userData.$layout]);
    function renderLayout(layout, data, content) {
        data["$content"] = content;
        let newContent = layout.template(data);
        if (layout.layout)
            return renderLayout(layout.layout, data, newContent);
        else
            return newContent;
    }
    // clear output folder
    if (fs.existsSync(OUT)) {
        function clearDir(inputPath, keepFolder = false) {
            fs.readdirSync(inputPath).forEach((fileOrFolder) => {
                var filePath = path.join(inputPath, fileOrFolder);
                if (fs.statSync(filePath).isFile())
                    fs.unlinkSync(filePath);
                else
                    clearDir(filePath);
            });
            if (!keepFolder)
                fs.rmdirSync(inputPath);
        }
        clearDir(OUT, true);
    }
    // copy assets
    ASSET_FILES.forEach(inputPath => {
        let targetPath = path.join(OUT, path.relative(ROOT, inputPath));
        mkdirp.sync(path.dirname(targetPath));
        fsx.copySync(inputPath, targetPath);
    });
    // render pages
    marked.setOptions({
        highlight: (code, lang) => {
            let res;
            if (!lang)
                res = hljs.highlightAuto(code).value;
            else
                res = hljs.highlight(lang, code).value;
            return res;
        }
    });
    function renderPage(page) {
        let subst = null;
        let abort = null;
        console.log(page.path);
        const TEMPLATE_DATA = createTemplateData(page);
        TEMPLATE_DATA["subst"] = (page) => subst = page;
        TEMPLATE_DATA["abort"] = () => abort = true;
        let html = "";
        if (page.template)
            html = page.template(TEMPLATE_DATA);
        if (page.isMarkdown)
            html = marked.parse(html);
        if (page.layout)
            html = renderLayout(page.layout, TEMPLATE_DATA, html);
        if (subst != null) {
            var extended = _.extend({}, subst);
            extended.href = page.href;
            extended.outPath = page.outPath;
            extended.userData = _.extend({}, subst.userData, page.userData);
            return renderPage(extended);
        }
        if (abort != null)
            return null;
        return html;
    }
    function createTemplateData(page, userData) {
        return {
            $page: page,
            $model: userData || page.userData,
            $layouts: LAYOUTS_BY_NAME,
            $pages: CONTENT_PAGES,
            $config: CONFIG,
            href: (rel) => path.normalize(path.join(CONFIG.prefix, rel)).replace(/\\/g, "/"),
            asset: (rel) => path.normalize(path.join(CONFIG.prefix, CONFIG.assets, rel)).replace(/\\/g, "/"),
            renderLayout: function (layout, userData) {
                LAYOUTS_BY_NAME[layout].template(createTemplateData(page, userData));
            },
            renderPage: renderPage,
        };
    }
    for (let i = 0; i < CONTENT_PAGES.length; i++) {
        var html = renderPage(CONTENT_PAGES[i]);
        if (html) {
            const filename = path.join(OUT, CONTENT_PAGES[i].outPath);
            mkdirp.sync(path.dirname(filename));
            fs.writeFileSync(filename, html);
        }
    }
    console.log("Done");
    if (!isWatching)
        process.exit();
}
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLDJCQUEyQjtBQUMzQixpQ0FBaUM7QUFFakMsZ0NBQWdDO0FBQ2hDLDZCQUE2QjtBQUM3QixpQ0FBaUM7QUFDakMscUNBQXFDO0FBQ3JDLGdDQUFnQztBQUNoQyxxQ0FBcUM7QUFDckMscUNBQXFDO0FBRXJDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBVW5DLE1BQU0sY0FBYyxHQUFXO0lBQzNCLE1BQU0sRUFBRSxHQUFHO0lBQ1gsR0FBRyxFQUFFLEtBQUs7SUFDVixNQUFNLEVBQUUsUUFBUTtJQUNoQixPQUFPLEVBQUUsU0FBUztJQUNsQixNQUFNLEVBQUUsUUFBUTtDQUNuQixDQUFBO0FBbUJELElBQUksR0FBRyxHQUFHLE9BQU87S0FDZCxPQUFPLENBQUMsT0FBTyxDQUFDO0tBQ2hCLE9BQU8sQ0FBQyxVQUFVLENBQUM7S0FDbkIsV0FBVyxDQUFDLGdFQUFnRSxDQUFDO0tBQzdFLFNBQVMsQ0FBQyxRQUFRLENBQUM7S0FDbkIsTUFBTSxDQUFDLGFBQWEsRUFBRSxZQUFZLENBQUM7S0FDbkMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUV2QixNQUFNLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQ25GLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUUzQixNQUFNLE1BQU0sR0FBVyxDQUFDLENBQUMsTUFBTSxDQUFDLEVB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