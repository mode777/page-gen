{{##
    def.menuOrder = 2;
    def.menuTitle = "Blog";
#}}

{{
    var page = it.$pages
        .filter(p => p.userData.date)
        .sort((a,b) => b.userData.date - a.userData.date)[0];
    
    if(page){
        it.subst(page); 
    }
}}