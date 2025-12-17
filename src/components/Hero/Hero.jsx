import VideoSlider from "../VideoSlider/VideoSlider";
import classes from "./Hero.module.css";

const Hero = () => {
  return (
    <div className={classes.container}>
      <VideoSlider />
      <div className={classes.line33} />
      <div className={classes.line66} />
    </div>
  );
};

export default Hero;
