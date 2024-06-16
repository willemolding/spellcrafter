import cards from "../generated/cards.json";
import { Plugin } from "renjs";
import { call, subscribe } from "esdeka";
import { ISpellcrafterGame } from "../interfaces/spellcrafter_game";
import { DojoSpellcrafterGame } from "./dojo_spellcrafter_game";

export class SpellcrafterPlugin extends RenJS.Plugin {
    // class SpellcrafterPlugin extends Plugin {

    spellcrafterGame: ISpellcrafterGame;
    cardDisplayGroup;
    setCard;
    barrierImages: any = [];
    powerText: Phaser.Text;
    chaosText: Phaser.Text;
    lightDarkText: Phaser.Text;
    lightDarkOrb: Phaser.Image;
    hotColdText: Phaser.Text;
    hotColdOrb: Phaser.Image;
    host: Window;

    onInit(): void {
        const unsubscribe = subscribe("spellcrafter", event => {
            console.log("Ren received initial state:", event.data.action.payload);
            this.host = event.source as Window;
            unsubscribe(); // ensure this can only be called once

            this.spellcrafterGame = new DojoSpellcrafterGame(event.data.action.payload, this.host)
            call(this.host, "command", { action: "connected" });
            this.game.gui.changeMenu('hud').then(() => {
                this.game.start();
            });
        });
    }

    // called when new game is started, just before interpreter is called
    onStart(): void {
        const cardBack = this.game.add.image(195, 195, "cardback");
        const cardName = this.game.add.text(300, 250, "", { font: "55px fontsaudimat-mono", fill: "#FFFFFF", boundsAlignV: "top", boundsAlignH: "center" })
        const cardText = this.game.add.text(300, 370, "", { font: "40px fontsaudimat-mono", fill: "#FFFFFF", boundsAlignV: "middle" });

        // top bar
        
        this.game.gui.hud.add(this.game.add.image(40, 35, "topbar"));
        this.game.gui.hud.add(this.game.add.image(625, 160, "topbarhang"));

        this.game.gui.hud.add(this.game.add.image(100, 62, "orbpower"));
        this.powerText = this.game.add.text(195, 57, "0", { font: "60px fontsaudimat-mono", fill: "#AA85BD", boundsAlignV: "top", boundsAlignH: "center" });
        this.game.gui.hud.add(this.powerText);

        this.game.gui.hud.add(this.game.add.image(100+230, 62, "orbchaos"));
        this.chaosText = this.game.add.text(195+230, 57, "0", { font: "60px fontsaudimat-mono", fill: "#AA85BD", boundsAlignV: "top", boundsAlignH: "center" });
        this.game.gui.hud.add(this.chaosText);

        this.hotColdOrb = this.game.add.image(100+490, 62, "orbhot");
        this.game.gui.hud.add(this.hotColdOrb);
        this.hotColdText = this.game.add.text(195+490, 57, "0", { font: "60px fontsaudimat-mono", fill: "#AA85BD", boundsAlignV: "top", boundsAlignH: "center" });
        this.game.gui.hud.add(this.hotColdText);

        this.lightDarkOrb = this.game.add.image(100+680, 62, "orblight");
        this.game.gui.hud.add(this.lightDarkOrb);
        this.lightDarkText = this.game.add.text(195+680, 57, "0", { font: "60px fontsaudimat-mono", fill: "#AA85BD", boundsAlignV: "top", boundsAlignH: "center" });
        this.game.gui.hud.add(this.lightDarkText);

        this.cardDisplayGroup = this.game.add.group()
        this.cardDisplayGroup.add(cardBack);
        this.cardDisplayGroup.add(cardName);
        this.cardDisplayGroup.add(cardText);
        this.cardDisplayGroup.visible = false;

        this.setCard = (cardId: number) => {
            cardName.setText(cards[cardId].name);
            cardText.setText(cards[cardId].description);
        }

        this.barrierImages.push(this.game.add.image(640, 165, "barrier"));
        this.barrierImages.push(this.game.add.image(750, 165, "barrier"));
        this.barrierImages.push(this.game.add.image(860, 165, "barrier"));
        this.barrierImages.forEach(img => { this.game.gui.hud.add(img) });

        this._syncState();
        this._syncBarriers();
    }

    onAction(action): void {
    }

    /// Called when the plugin is called from the story the `call spellcrafter` command
    // examples:
    //  call SpellCrafter: forage forest
    //  call SpellCrafter: interact 3
    // call spellCrafter : showItemsChoice
    onCall({ body }): void {
        console.log("spellcrafter called with: ", body);
        const [method, ...args] = body.split(" ");

        const decodeCall = (method: string, ...args: any[]): Promise<void> => {
            switch (method) {
                case "printDebug":
                    console.log(this.spellcrafterGame);
                    return Promise.resolve();
                case "forage":
                    return this.forage(args[0]);
                case "selectAndAddIngredient":
                    return this.selectAndAddIngredient();
                case "summonFamiliar":
                    return this.summonFamiliar(args[0]);
                case "sendFamiliar":
                    return this.sendFamiliar();
                case "sacrificeFamiliar":
                    return this.sacrificeFamiliar();
                case "claimFamiliarItem":
                    return this.claimFamiliarItem();
                case "wait":
                    return this.wait();
                case "showCard":
                    return this.showCard();
                case "hideCard":
                    return this.hideCard();
                case "updateBarriers":
                    this._syncBarriers();
                    return Promise.resolve();
                case "showBarriers":
                    // this.barrierImages.forEach(img => { img.visible = true });
                    return Promise.resolve();
                case "hideBarriers":
                    // this.barrierImages.forEach(img => { img.visible = false });
                    return Promise.resolve();
                case "showDeathReport":
                    this.showDeathReport();
                    return Promise.resolve();
                default:
                    throw new Error("invalid method: " + method);
            }
        }

        decodeCall(method, ...args).then(() => {
            this._syncState();
        }).catch(async (err) => {
            console.error(err.message);
            this._syncState();
            await this.game.managers.text.display(err.message, "default");
            this.game.managers.story.startScene("manageActions");
            // hang forever
        }).finally(async () => {
            this.game.resolveAction(); // must call this to return control to the story
        });
    }

    /// Display the currently owned items and allow the player to select one
    /// After this resolves the `chosenItem` variable will hold the index of the chosen item
    /// This promise will also resolve with the chosen value
    async selectAndAddIngredient(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let selectedCardIndex = 0;

            const updateCardDisplay = () => {
                cardName.setText(cards[this.spellcrafterGame.cards[selectedCardIndex][0]].name);
                cardText.setText(cards[this.spellcrafterGame.cards[selectedCardIndex][0]].description);
            }

            const hideCardChoser = () => {
                cardBack.destroy();
                cardName.destroy();
                cardText.destroy();
                cancelButton.destroy();
                leftButton.destroy();
                rightButton.destroy();
                addToSpellButton.destroy();
                buttonText.destroy();
            }

            const returnToStory = () => {
                resolve();
            }

            const cardBack = this.game.add.image(195, 195, "cardback");
            const cardName = this.game.add.text(300, 250, "", { font: "55px fontsaudimat-mono", fill: "#FFFFFF", boundsAlignV: "top", boundsAlignH: "center" })
            const cardText = this.game.add.text(300, 370, "", { font: "40px fontsaudimat-mono", fill: "#FFFFFF", boundsAlignV: "middle" });

            updateCardDisplay();

            const cancelButton = this.game.add.button(875, 190, "cancel-button", () => {
                this.game.managers.logic.vars["lastAddedItemName"] = "nothing";
                this.game.managers.logic.vars["chaosDelta"] = 0;
                this.game.managers.logic.vars["powerDelta"] = 0;
                hideCardChoser();
                returnToStory();
            }, this, 0);

            const leftButton = this.game.add.button(43, 845, "back-button", () => {
                selectedCardIndex = (selectedCardIndex - 1 + this.spellcrafterGame.cards.length) % this.spellcrafterGame.cards.length;
                updateCardDisplay()
            }, this, 0);
            const rightButton = this.game.add.button(875 + 150, 845 + 150, "back-button", () => {
                selectedCardIndex = (selectedCardIndex + 1) % this.spellcrafterGame.cards.length;
                updateCardDisplay()
            }, this, 0);
            rightButton.rotation = Math.PI;

            const addToSpellButton = this.game.add.button(40, 1025, "button", async () => {
                hideCardChoser();
                let pre_stats = { ...this.spellcrafterGame.stats };
                this.game.managers.logic.vars["lastAddedItemName"] = cards[this.spellcrafterGame.cards[selectedCardIndex][0]].name;
                await this.spellcrafterGame.interact(this.spellcrafterGame.cards[selectedCardIndex][0]);
                this.game.managers.logic.vars["chaosDelta"] = this.spellcrafterGame.stats.chaos - pre_stats.chaos;
                this.game.managers.logic.vars["powerDelta"] = this.spellcrafterGame.stats.power - pre_stats.power;
                this.game.managers.logic.vars["lightdarkDelta"] = this.spellcrafterGame.stats.lightDark - pre_stats.lightDark;
                this.game.managers.logic.vars["hotcoldDelta"] = this.spellcrafterGame.stats.hotCold - pre_stats.hotCold;

                returnToStory();
            }, this, 0);
            const buttonText = this.game.add.text(360, 1050, "Add To Spell", { font: "45px fontsaudimat-mono", fill: "#FFFFFF", boundsAlignV: "middle", boundsAlignH: "center" });

        });
    }

    async forage(region: string): Promise<void> {
        let pre_chaos = this.spellcrafterGame.stats.chaos;
        let pre_barriers = this.spellcrafterGame.stats.barriers;
        let pre_cards = this.spellcrafterGame.cards;

        await this.spellcrafterGame.forage(region);

        this._setLastForagedItem(findNewCard(pre_cards, this.spellcrafterGame.cards));
        this.game.managers.logic.vars["chaosDelta"] = this.spellcrafterGame.stats.chaos - pre_chaos;
        this.game.managers.logic.vars["barriersDelta"] = this.spellcrafterGame.stats.barriers - pre_barriers;
    }

    async summonFamiliar(region: string): Promise<void> {
        let pre_chaos = this.spellcrafterGame.stats.chaos;
        let pre_barriers = this.spellcrafterGame.stats.barriers;

        await this.spellcrafterGame.summonFamiliar(region);

        this.game.managers.logic.vars["chaosDelta"] = this.spellcrafterGame.stats.chaos - pre_chaos;
        this.game.managers.logic.vars["barriersDelta"] = this.spellcrafterGame.stats.barriers - pre_barriers;
    }

    async sendFamiliar(): Promise<void> {
        await this.spellcrafterGame.sendFamiliar();
    }

    async sacrificeFamiliar(): Promise<void> {
        await this.spellcrafterGame.sacrificeFamiliar();
    }

    async claimFamiliarItem(): Promise<void> {
        try {
            let pre_cards = this.spellcrafterGame.cards;
            await this.spellcrafterGame.claimFamiliarItem();
            this._setLastForagedItem(findNewCard(pre_cards, this.spellcrafterGame.cards));
            this.game.managers.logic.vars["familiarReturnedItem"] = true;
        } catch (err) { // just print errors here since we know this can fail
            console.log("familiar item check failed: ", err.message);
        }
    }

    async wait(): Promise<void> {
        let pre_chaos = this.spellcrafterGame.stats.chaos;
        let pre_barriers = this.spellcrafterGame.stats.barriers;

        await this.spellcrafterGame.wait();

        this.game.managers.logic.vars["chaosDelta"] = this.spellcrafterGame.stats.chaos - pre_chaos;
        this.game.managers.logic.vars["barriersDelta"] = this.spellcrafterGame.stats.barriers - pre_barriers;
    }

    async showCard(): Promise<void> {
        this.setCard(this.game.managers.logic.vars["lastForagedItem"]);
        this.cardDisplayGroup.visible = true;
    }

    async hideCard(): Promise<void> {
        this.cardDisplayGroup.visible = false;
    }

    showDeathReport(): void {
        
    }

    _setLastForagedItem(lastForagedItem: number | null): void {
        this.game.managers.logic.vars["lastForagedItem"] = lastForagedItem ? cards[lastForagedItem].card_id : null
        this.game.managers.logic.vars["lastForagedItemName"] = lastForagedItem ? cards[lastForagedItem].name : null
        this.game.managers.logic.vars["lastForagedItemDescription"] = lastForagedItem ? cards[lastForagedItem].description : null
        this.game.managers.logic.vars["lastForagedItemFlavour"] = lastForagedItem ? cards[lastForagedItem].flavour : null
    }

    /// copies variables from the game state object into the renjs context
    /// so they can be displayed in-game and used to alter the story flow
    /// This does not sync the barriers so they can be dramatically revealed later
    _syncState(): void {
        const stats = this.spellcrafterGame.stats;

        this.game.managers.logic.vars["chaos"] = stats.chaos;
        this.game.managers.logic.vars["power"] = stats.power;
        this.game.managers.logic.vars["lightdark"] = stats.lightDark;
        this.game.managers.logic.vars["hotcold"] = stats.hotCold;
        this.game.managers.logic.vars["barriers"] = stats.barriers;
        this.game.managers.logic.vars["dead"] = stats.barriers <= 0;
        this.game.managers.logic.vars["time"] = this.spellcrafterGame.time;
        this.game.managers.logic.vars["itemCount"] = this.spellcrafterGame.cards.length;

        this.powerText.setText(stats.power.toString());
        this.chaosText.setText(stats.chaos.toString());
        
        this.hotColdText.setText(Math.abs(stats.hotCold).toString());
        this.hotColdOrb.loadTexture(stats.hotCold < 0 ? "orbcold" : "orbhot");
        
        this.lightDarkText.setText(Math.abs(stats.lightDark).toString());
        this.lightDarkOrb.loadTexture(stats.lightDark < 0 ? "orbdark" : "orblight");

        if (this.spellcrafterGame.familiar) {
            this.game.managers.logic.vars["familiar"] = this.spellcrafterGame.familiar.id;
            this.game.managers.logic.vars["familiarName"] = this.spellcrafterGame.familiar.familiarType;
            this.game.managers.logic.vars["familiarIdle"] = this.spellcrafterGame.familiar.busyUntil <= this.spellcrafterGame.time;
        } else {
            this.game.managers.logic.vars["familiar"] = null;
        }
    }

    _syncBarriers(): void {
        for (let i = 0; i < 3; i++) {
            if (this.spellcrafterGame.stats.barriers >= (i + 1))
                this.barrierImages[2 - i].loadTexture("barrier");
            else
                this.barrierImages[2 - i].loadTexture("barrier-broken");
        }
    }
}

function findNewCard(preCards: Array<[number, number]>, postCards: Array<[number, number]>): number | null {
    const before = new Map();
    preCards.forEach(([cardId, count]) => {
        before.set(cardId, count);
    })
    for (let i = 0; i < postCards.length; i++) {
        if(before.get(postCards[i][0]) == undefined || before.get(postCards[i][0]) < postCards[i][1]) {
            return postCards[i][0];
        }
    }
    return null;
}
