/**
 * @name Follow User
 * @author 60
 * @version 1.0.0
 * @description Right click a user to follow them. Only one user can be followed at a time.
 */

const { Webpack, Webpack: { Filters }, Patcher, ContextMenu, Utils } = BdApi,
	config = {};

module.exports = class FollowUser {
	constructor(meta) {
		config.info = meta;
		this.following = {};
		this.frameWatchers = {};
		this.currentFollowedId = null;
	}

	load() {
		try {
			global.ZeresPluginLibrary.PluginUpdater.checkForUpdate(config.info.name, config.info.version, config.info.updateUrl);
		} catch (err) {
			console.error(config.info.name, "Updater error.", err);
		}
	}

	start() {
		try {
			this.VoiceStateStore = Webpack.getStore("VoiceStateStore");
			this.selectVoiceChannel = Webpack.getModule(Filters.byKeys("selectChannel")).selectVoiceChannel;
			this.Dispatcher = Webpack.getModule(Webpack.Filters.byKeys("_dispatch"));
			this.patchUserContextMenu();
			this.listenToVoiceChanges();
		} catch (err) {
			console.error("Start error:", err);
			this.stop();
		}
	}

	stop() {
		Patcher.unpatchAll(config.info.slug);
		config.userContextPatch?.();
		this.unlistenToVoiceChanges();
		Object.keys(this.frameWatchers).forEach(uid => cancelAnimationFrame(this.frameWatchers[uid]));
		this.following = {};
		this.frameWatchers = {};
		this.currentFollowedId = null;
	}

	patchUserContextMenu() {
		config.userContextPatch = ContextMenu.patch("user-context", (returnValue, props) => {
			let callButtonParent = Utils.findInTree(returnValue, e => Array.isArray(e) && e.some(b => b?.props?.id === "call"));
			if (!callButtonParent) return;

			if (!callButtonParent.some(btn => btn?.props?.id === config.info.slug)) {
				const followed = this.currentFollowedId === props.user.id;
				callButtonParent.push(ContextMenu.buildItem({
					id: config.info.slug,
					label: `Follow User`,
					checked: followed,
					type: "toggle",
					action: () => {
						if (followed) {
							delete this.following[props.user.id];
							cancelAnimationFrame(this.frameWatchers[props.user.id]);
							delete this.frameWatchers[props.user.id];
							this.currentFollowedId = null;
						} else {
							if (this.currentFollowedId !== null) {
								delete this.following[this.currentFollowedId];
								cancelAnimationFrame(this.frameWatchers[this.currentFollowedId]);
								delete this.frameWatchers[this.currentFollowedId];
							}
							this.currentFollowedId = props.user.id;
							this.following[props.user.id] = true;
							this.continuouslyFollow(props.user.id);
						}
					}
				}));
			}
		});
	}

	listenToVoiceChanges() {
		this.voiceListener = ({ userId, channelId }) => {
			if (this.currentFollowedId !== userId) return;
			if (channelId) this.selectVoiceChannel(channelId);
		};
		this.Dispatcher.subscribe("VOICE_STATE_UPDATE", this.voiceListener);
	}

	unlistenToVoiceChanges() {
		if (this.voiceListener) {
			this.Dispatcher.unsubscribe("VOICE_STATE_UPDATE", this.voiceListener);
		}
	}

	continuouslyFollow(userId) {
		const attemptJoin = () => {
			if (this.currentFollowedId !== userId) return;
			const vs = this.VoiceStateStore.getVoiceStateForUser(userId);
			if (vs?.channelId) {
				this.selectVoiceChannel(vs.channelId);
			}
			this.frameWatchers[userId] = requestAnimationFrame(attemptJoin);
		};
		attemptJoin();
	}
};
