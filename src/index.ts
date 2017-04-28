import * as fs from "fs";
import * as path from "path";
import * as doT from "dot";
import * as marked from "marked";
import * as util from "util";
import * as _ from "underscore";
import * as glob from "glob";

doT.templateSettings.strip = false;

interface Config {
    out: string;
    layout: string;
    content: string
}

const CONFIG_DEFAULT: Config = {
    out: "out",
    layout: "layout",
    content: "content",
}

type template = (data: any) => string;

interface Page {
    rawContent?: string;
    path?: string;
    name?: string;
    filename?: string;
    ext?: string;
    folder?: string;
    template?: template;
    userData?: any;
    isMarkdown?: boolean;
    layout?: Page; 
    outPath?: string;
}

async function main(){

    // Set paths
    const ROOT = process.argv[2] ? path.join(process.cwd(), process.argv[2]) : process.cwd(); 
    const CONFIG = <Config>_.extend({}, CONFIG_DEFAULT, fs.existsSync(path.join(ROOT, "page.config.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "page.config.json"), "utf8")) : {});
    const CONTENT = path.join(ROOT, CONFIG.content);
    const LAYOUT = path.join(ROOT, CONFIG.layout);
    const OUT = path.join(ROOT, CONFIG.out);

    // Collect files
    function collectFilesAsync(dir: string){
        return new Promise<string[]>((res, rej) => {
            glob(path.join(dir, "**/*.*"),(err, match) => {
                if(err)
                    rej(err);
                else
                    res(match);
            });
        });
    }

    const CONTENT_FILES = await collectFilesAsync(CONTENT); 
    const LAYOUT_FILES = await collectFilesAsync(LAYOUT); 

    // Create page-templates
    function createPage(filename: string): Page {
        let page: Page = {
            path: filename,
            rawContent: fs.readFileSync(filename, "utf8"),
            name: path.basename(filename).replace(/\.[^/.]+$/, ""),
            filename: path.basename(filename),
            folder: path.dirname(filename),
            ext: path.extname(filename),
            userData: {}
        }

        page.isMarkdown = page.ext.toLocaleUpperCase() == ".MD"; 
        page.template = doT.template(page.rawContent, null, page.userData);
        page.outPath = path.join(OUT, path.relative(page.folder, CONTENT), page.name + ".html");

        return page;
    }

    const CONTENT_PAGES = <Page[]>CONTENT_FILES.map(createPage);
    const LAYOUT_PAGES = <Page[]>LAYOUT_FILES.map(createPage);

    // Build layout graph
    const LAYOUTS_BY_NAME = {};
    LAYOUT_PAGES.forEach(x => LAYOUTS_BY_NAME[x.filename] = x);

    LAYOUT_PAGES.forEach(x => x.layout = LAYOUTS_BY_NAME[x.userData.layout]);
    CONTENT_PAGES.forEach(x => x.layout = LAYOUTS_BY_NAME[x.userData.layout]);

    function renderLayout(layout: Page, data: any, content: string){
        data["$content"] = content;
        let newContent = layout.template(data);

        if(layout.layout)
            return renderLayout(layout.layout, data, newContent);
        else
            return newContent;
    }

    for (let i = 0; i < CONTENT_PAGES.length; i++) {
        var page = CONTENT_PAGES[i];
        const TEMPLATE_DATA = {
            $page: page.userData,
            $layouts: LAYOUTS_BY_NAME,
            $pages: CONTENT_PAGES,
            $config: CONFIG
        };
        
        let html = "";
        if(page.template)
            html = page.template(TEMPLATE_DATA);

        if(page.isMarkdown)
            html = marked.parse(html);

        if(page.layout)
            html = renderLayout(page.layout, TEMPLATE_DATA, html);

        fs.writeFileSync(page.outPath, html);
    }
};

main();
